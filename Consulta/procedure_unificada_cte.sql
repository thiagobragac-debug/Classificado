CREATE PROCEDURE PROC_CONSULTA_UNIFICADA (
    IN FormatCode NVARCHAR(100),
    IN DocDateIni DATE,
    IN DocDateFim DATE,
    IN AcctName NVARCHAR(100)
)
LANGUAGE SQLSCRIPT
AS
BEGIN

-- DECLARAÇÃO DE VARIÃVEIS (No HANA, todas as variÃ¡veis locais devem ser declaradas no inÃ­cio do bloco BEGIN)
DECLARE C2_DataIni DATE;
DECLARE C2_DataFim DATE;
DECLARE C2_CardCodeIni NVARCHAR(20);
DECLARE C2_CardCodeFim NVARCHAR(20);
DECLARE V_CardType NVARCHAR(1);
DECLARE Processamento NVARCHAR(1);
DECLARE TipoExecucao NVARCHAR(1);
DECLARE SaldoZero NVARCHAR(1);
DECLARE VencimentoIni DATE;
DECLARE VencimentoFim DATE;
DECLARE BPLIdIni INT;
DECLARE BPLIdFim INT;
DECLARE BPLIdSTD INT;

-------------------------------------------------------------------------
-- PARTE 1: LÓGICA DA CONSULTA 1 (Contas a Receber / NFS / LCM / ADT / NFE)
-------------------------------------------------------------------------


-- ATRIBUICAO DE VARIAVEIS DA PARTE 2 (EXECUTADAS ANTES DO BLOCO WITH)
Processamento := '0';  
TipoExecucao := '1';  
BPLIdIni := 0;
BPLIdFim := 999;
VencimentoIni := '19000101';
VencimentoFim := '20991231';
V_CardType := 'S';
SaldoZero := 'N';

C2_DataIni := :DocDateIni;
C2_DataFim := :DocDateFim;

-- Deixe os filtros de parceiro abertos ou passe via parÃ¢metros
SELECT min(t9."CardCode") INTO C2_CardCodeIni FROM "SBO_PTC_PRD"."OCRD" as t9 where t9."CardType" = :V_CardType or :V_CardType = '*';
SELECT max(t9."CardCode") INTO C2_CardCodeFim FROM "SBO_PTC_PRD"."OCRD" as t9 where t9."CardType" = :V_CardType or :V_CardType = '*';
SELECT ifnull(max(t0."BPLId"),1) INTO BPLIdSTD from "SBO_PTC_PRD"."OBPL" as t0 where t0."MainBPL" = 'Y' and t0."Disabled" = 'N';

WITH 
DOC_NFS_TMP AS (
SELECT 	 
T2."BPLId" AS "Filial",
T2."DocNum" AS "Num. NF",
T2."DocEntry" AS "Num Interno NF",
T0."DocNum" AS "Num Contas a Receber",
T0."DocEntry" AS "Num interno CR",
T2."VATRegNum" AS "CNPJ Cliente",
T2."CardCode" AS "Código Cliente",
T2."CardName" AS "Nome Cliente",
'NFS' AS "Tipo de Documento",
CAST(T22."BaseRef" AS NVARCHAR(200)) AS "Entrega",
CASE WHEN T2."SeqCode" = -1 THEN 'Manual' ELSE 'NFSe' END AS "Tipo Número Nota",
CAST(CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS NVARCHAR(100)) AS "Num. RPS",
CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS "Notas Saída",
T2."DocDate" AS "Data de lançamento da NF de Saída",
T0."DocDate" AS "Data de lançamento do Contas a Receber",
T0."DocTotal" AS "Valor da Transferência",
T0."TrsfrDate" AS "Data da Transferência",
T4."InsTotal" + ROUND((T4."InsTotal" * T2."WTSum" / T2."DocTotal"),2) AS "Valor Bruto",
T0."BcgSum" + T0."UndOvDiff" AS "Encargos",
T1."SumApplied" - T1."WtAppld" AS "Pago atÃ© nota fiscal (IR)",
T1."DcntSum" AS "Desconto concedido",
T1."SumApplied" - T1."WtAppld" + T0."BcgSum" + T0."UndOvDiff" AS "Valor Recebido",
(SELECT S7."U_SKILL_LisSer" FROM OITM S7 INNER JOIN (SELECT S0."ItemCode" FROM INV1 S0 WHERE S0."DocEntry" = T2."DocEntry" AND S0."LineNum" = (SELECT MIN(S1."LineNum") 
FROM INV1 S1 WHERE S1."DocEntry" = T2."DocEntry")) S2 ON S7."ItemCode" = S2."ItemCode" ) AS "Código de serviço",
T5."FormatCode" AS "Código da Conta Contábil",
T5."AcctName" AS "Descrição Conta Contábil",
T1."SumApplied",
T2."DocTotal",
T1."DocEntry",
T1."InvoiceId",
T1."InvType"
FROM ORCT T0
INNER JOIN RCT2 T1 ON T1."DocNum" = T0."DocEntry" 
INNER JOIN OINV T2 ON T1."DocEntry" = T2."DocEntry" AND T1."InvType" = T2."ObjType" 
      INNER JOIN INV1 T22 ON T2."DocEntry" = T22."DocEntry" 
INNER JOIN INV6 T4 ON T2."DocEntry" = T4."DocEntry" AND T1."InstId" = T4."InstlmntID"
INNER JOIN OACT T5 ON T0."TrsfrAcct" = T5."AcctCode"
LEFT JOIN "@SKILL_NOFSNFSE001" T6 ON T2."DocEntry" = T6."U_NrDocEntry"   AND IFNULL(CAST(T6."U_UltErro" AS VARCHAR(50)),'') = ''	
LEFT JOIN "Doc" T7 ON T2."DocEntry" = T7."DocEntry" 				  
WHERE T0."Canceled" = 'N' AND (T5."FormatCode" = :FormatCode OR :FormatCode = '') AND (T5."AcctName" = :AcctName OR :AcctName = '') AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim
),
DOC_NFS_ENCARGOS AS (
SELECT
T1."Num interno CR",
MIN(T0."DocEntry") 	AS "DocEntry",
MIN(T0."InvoiceId")	AS "InvoiceId"
FROM RCT2 T0
INNER JOIN :DOC_NFS_TMP T1 ON T0."DocNum" = T1."Num interno CR"
GROUP BY T1."Num interno CR"
),
DOC_NFS AS (
SELECT
T0."Filial", T0."Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente", T0."Código Cliente", T0."Nome Cliente",
T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída", T0."Data de lançamento da NF de Saída",
T0."Data de lançamento do Contas a Receber", T0."Valor da Transferência", T0."Data da Transferência", T0."Valor Bruto",
CASE WHEN T0."DocEntry" = IFNULL(T1."DocEntry",-1) AND T0."InvoiceId" = IFNULL(T1."InvoiceId",-1) THEN T0."Encargos" ELSE CAST(0 AS DECIMAL(38,19)) END AS "Multa / Juros",
T0."Desconto concedido",
T0."Pago atÃ© nota fiscal (IR)" + (CASE WHEN T0."DocEntry"= IFNULL(T1."DocEntry",-1) AND T0."InvoiceId"=IFNULL(T1."InvoiceId",-1) THEN T0."Encargos" ELSE CAST(0 AS DECIMAL(38,19)) END) AS "Valor Recebido",
T0."Código de serviço", T0."Código da Conta Contábil", T0."Descrição Conta Contábil", T0."SumApplied", T0."DocTotal"
FROM :DOC_NFS_TMP T0
LEFT JOIN :DOC_NFS_ENCARGOS T1 ON T0."Num interno CR" = T1."Num interno CR"
),
IMP_NFS0 AS (
SELECT T0."AbsEntry", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('1','11') GROUP BY T0."AbsEntry"
),
IMP_NFS1 AS (
SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('2','14') GROUP BY T0."AbsEntry"
),
IMP_NFS2 AS (
SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '3' GROUP BY T0."AbsEntry"
),
IMP_NFS3 AS (
SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('6','8') GROUP BY T0."AbsEntry"
),
IMP_NFS4 AS (
SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '5' GROUP BY T0."AbsEntry"
),
IMP_NFS5 AS (
SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('4','13') GROUP BY T0."AbsEntry"
),
IMP_TOTAL_NFS AS (
SELECT T0."AbsEntry", SUM("PIS") AS "VLPIS", SUM("COFINS") AS "VLCOFINS", SUM("IR") AS "VLIR", SUM("ISS") AS "VLISS", SUM("INSS") AS "VLINSS", SUM("CSLL") AS "VLCSLL" FROM :IMP_NFS T0 GROUP BY T0."AbsEntry")
),
REGISTROS_NFS AS (
SELECT 	 
T0."Filial", T0."Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente", T0."Código Cliente", T0."Nome Cliente",
T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída", T0."Data de lançamento da NF de Saída",
T0."Data de lançamento do Contas a Receber", T0."Valor da Transferência", T0."Data da Transferência", T0."Valor Bruto",
ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) AS "Valor PIS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) AS "Valor COFINS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) AS "Valor de IR Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) AS "Valor de ISS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) AS "Valor de INSS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor de CSLL Retido na NF",
T0."Valor Bruto" - ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor Líquido", 
T0."Multa / Juros", T0."Desconto concedido", T0."Valor Recebido", T0."Código de serviço", T0."Código da Conta Contábil", T0."Descrição Conta Contábil"
FROM :DOC_NFS T0 LEFT JOIN :IMP_TOTAL_NFS T1 ON T1."AbsEntry" = T0."Num Interno NF")
),
REGISTROS_LCM AS (
SELECT 	
T0."BPLId" AS "Filial", T2."TransId" AS "Num. NF", T2."TransId" AS "Num Interno NF", T0."DocNum" AS "Num Contas a Receber", T0."VATRegNum" AS "CNPJ Cliente", T0."CardCode" AS "Código Cliente", T0."CardName" AS "Nome Cliente",
'LCM' AS "Tipo de Documento", CAST(' ' AS NVARCHAR(200)) AS "Entrega", '' AS "Tipo Número Nota", '' AS "Num. RPS", '' as "Notas Saída", T2."RefDate" AS "Data de lançamento da NF de Saída", T0."DocDate" AS "Data de lançamento do Contas a Receber",
T0."DocTotal" AS "Valor da Transferência", T0."TrsfrDate" AS "Data da Transferência", T1."SumApplied" AS "Valor Bruto", CAST(0 AS DECIMAL(38,19)) AS "Valor PIS Retido na NF", CAST(0 AS DECIMAL(38,19)) AS "Valor COFINS Retido na NF", CAST(0 AS DECIMAL(38,19)) AS "Valor de IR Retido na NF",
CAST(0 AS DECIMAL(38,19)) AS "Valor de ISS Retido na NF", CAST(0 AS DECIMAL(38,19)) AS "Valor de INSS Retido na NF", CAST(0 AS DECIMAL(38,19)) AS "Valor de CSLL Retido na NF", T1."SumApplied" AS "Valor Líquido",
CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') THEN T0."BcgSum" + T0."UndOvDiff" ELSE CAST(0 AS DECIMAL(38,19)) END AS "Multa / Juros",
T1."DcntSum" AS "Desconto concedido",
T1."SumApplied" - T1."WtAppld" + CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') THEN T0."BcgSum" + T0."UndOvDiff" ELSE CAST(0 AS DECIMAL(38,19)) END AS "Valor Recebido",
'' AS "Código de serviço", T3."FormatCode" AS "Código da Conta Contábil", T3."AcctName" AS "Descrição Conta Contábil"
FROM ORCT T0 INNER JOIN RCT2 T1 ON T1."DocNum" = T0."DocEntry" INNER JOIN OJDT T2 ON T1."DocEntry" = T2."TransId" INNER JOIN OACT T3 ON T0."TrsfrAcct" = T3."AcctCode" WHERE T0."Canceled" = 'N' AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim)
),
DOC_ADT AS (
SELECT 	 
T2."BPLId" AS "Filial", T2."DocNum" AS "Num. NF", T2."DocEntry" AS "Num Interno NF", T0."DocNum" AS "Num Contas a Receber", T2."VATRegNum" AS "CNPJ Cliente", T2."CardCode" AS "Código Cliente", T2."CardName" AS "Nome Cliente",
'ADT' AS "Tipo de Documento", CAST(' ' AS NVARCHAR(200)) AS "Entrega", CASE WHEN T2."SeqCode" = -1 THEN 'Manual' ELSE T9."SeqName" END AS "Tipo Número Nota",
CAST(CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS NVARCHAR(100)) AS "Num. RPS",
(select string_agg(Tc."Serial",',') from ODPI Ta inner JOIN INV11 Tb ON Tb."BaseAbs" = Ta."DocEntry" and Tb."LineType" = 'D' inner JOIN OINV Tc ON Tc."DocEntry" = Tb."DocEntry" where Tc."CANCELED" = 'N' and Ta."DocEntry" = T2."DocEntry") as "Notas Saída",
T2."DocDate" AS "Data de lançamento da NF de Saída", T0."DocDate" AS "Data de lançamento do Contas a Receber", T0."DocTotal" AS "Valor da Transferência", T0."TrsfrDate" AS "Data da Transferência",
T4."InsTotal" + ROUND((T4."InsTotal" * T2."WTSum" / T2."DocTotal"),2) AS "Valor Bruto",
CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") THEN T0."BcgSum" + T0."UndOvDiff" ELSE CAST(0 AS DECIMAL(38,19)) END AS "Multa / Juros",
T1."DcntSum" AS "Desconto concedido",
T1."SumApplied" - T1."WtAppld" + CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") THEN T0."BcgSum" + T0."UndOvDiff" ELSE CAST(0 AS DECIMAL(38,19)) END AS "Valor Recebido",
(SELECT S7."U_SKILL_LisSer" FROM OITM S7 INNER JOIN (SELECT S0."ItemCode" FROM DPI1 S0 WHERE S0."DocEntry" = T2."DocEntry" AND S0."LineNum" = (SELECT MIN(S1."LineNum") FROM DPI1 S1 WHERE S1."DocEntry" = T2."DocEntry")) S2 ON S7."ItemCode" = S2."ItemCode" ) AS "Código de serviço", 
T8."FormatCode" AS "Código da Conta Contábil", T8."AcctName" AS "Descrição Conta Contábil", T1."SumApplied", T2."DocTotal"
FROM ORCT T0 INNER JOIN RCT2 T1 ON T1."DocNum" = T0."DocEntry" INNER JOIN ODPI T2 ON T1."DocEntry" = T2."DocEntry" AND T1."InvType" = T2."ObjType" INNER JOIN DPI6 T4 ON T2."DocEntry" = T4."DocEntry" AND T1."InstId" = T4."InstlmntID"
LEFT JOIN "@SKILL_NOFSNFSE001" T6 ON T2."DocEntry" = T6."U_NrDocEntry" AND IFNULL(CAST(T6."U_UltErro" AS VARCHAR(50)),'') = '' INNER JOIN OACT T8 ON T0."TrsfrAcct" = T8."AcctCode" LEFT JOIN NFN1 T9 ON T2."SeqCode" = T9."SeqCode"
WHERE T0."Canceled" = 'N' AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim)
),
IMP_ADT AS (
SELECT T0."AbsEntry", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('1','11') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('2','14') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '3' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('6','8') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '5' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('4','13') GROUP BY T0."AbsEntry")
),
IMP_TOTAL_ADT AS (
SELECT T0."AbsEntry", SUM("PIS") AS "VLPIS", SUM("COFINS") AS "VLCOFINS", SUM("IR") AS "VLIR", SUM("ISS") AS "VLISS", SUM("INSS") AS "VLINSS", SUM("CSLL") AS "VLCSLL" FROM :IMP_ADT T0 GROUP BY T0."AbsEntry")
),
REGISTROS_ADT AS (
SELECT 
T0."Filial", T0."Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente", T0."Código Cliente", T0."Nome Cliente",
T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída", T0."Data de lançamento da NF de Saída", T0."Data de lançamento do Contas a Receber",
T0."Valor da Transferência", T0."Data da Transferência", T0."Valor Bruto",
ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) AS "Valor PIS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) AS "Valor COFINS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) AS "Valor de IR Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) AS "Valor de ISS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) AS "Valor de INSS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor de CSLL Retido na NF",
T0."Valor Bruto" - ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor Líquido", 
T0."Multa / Juros", T0."Desconto concedido", T0."Valor Recebido", T0."Código de serviço", T0."Código da Conta Contábil", T0."Descrição Conta Contábil"
FROM :DOC_ADT T0 LEFT JOIN :IMP_TOTAL_ADT T1 ON T1."AbsEntry" = T0."Num Interno NF")
),
DOC_NFE AS (
SELECT 	 
T2."BPLId" AS "Filial", T2."DocNum" AS "Num. NF", T2."DocEntry" AS "Num Interno NF", T0."DocNum" AS "Num Contas a Receber", T2."VATRegNum" AS "CNPJ Cliente", T2."CardCode" AS "Código Cliente", T2."CardName" AS "Nome Cliente",
'NFE' AS "Tipo de Documento", CAST(' ' AS NVARCHAR(200)) AS "Entrega", CASE WHEN T2."SeqCode" = -1 THEN 'Manual' ELSE T9."SeqName" END AS "Tipo Número Nota",
CAST(CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS NVARCHAR(100)) AS "Num. RPS",
CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS "Notas Saída",
T2."DocDate" AS "Data de lançamento da NF de Saída", T0."DocDate" AS "Data de lançamento do Contas a Receber", T0."DocTotal" AS "Valor da Transferência", T0."TrsfrDate" AS "Data da Transferência",
(T4."InsTotal" + ROUND((T4."InsTotal" * T2."WTSum" / T2."DocTotal"),2)) * -1 AS "Valor Bruto",
CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") THEN T0."BcgSum" + T0."UndOvDiff" ELSE CAST(0 AS DECIMAL(38,19)) END AS "Multa / Juros",
T1."DcntSum" AS "Desconto concedido",
(T1."SumApplied" - T1."WtAppld" + CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM VPM2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM VPM2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") THEN T0."BcgSum" + T0."UndOvDiff" ELSE CAST(0 AS DECIMAL(38,19)) END) * -1 AS "Valor Recebido",
(SELECT S7."U_SKILL_LisSer" FROM OITM S7 INNER JOIN (SELECT S0."ItemCode" FROM PCH1 S0 WHERE S0."DocEntry" = T2."DocEntry" AND S0."LineNum" = (SELECT MIN(S1."LineNum") FROM PCH1 S1 WHERE S1."DocEntry" = T2."DocEntry")) S2 ON S7."ItemCode" = S2."ItemCode" ) AS "Código de serviço", 
T8."FormatCode" AS "Código da Conta Contábil", T8."AcctName" AS "Descrição Conta Contábil", T1."SumApplied", T2."DocTotal"
FROM OVPM T0 INNER JOIN VPM2 T1 ON T1."DocNum" = T0."DocEntry" INNER JOIN OPCH T2 ON T1."DocEntry" = T2."DocEntry" AND T1."InvType" = T2."ObjType" INNER JOIN PCH6 T4 ON T2."DocEntry" = T4."DocEntry" AND T1."InstId" = T4."InstlmntID"
LEFT JOIN "@SKILL_NOFSNFSE001" T6 ON CAST(T2."DocEntry" as nvarchar(100)) = T6."U_NrDocEntry" AND IFNULL(CAST(T6."U_UltErro" AS VARCHAR(50)),'') = '' INNER JOIN OACT T8 ON T0."TrsfrAcct" = T8."AcctCode" LEFT JOIN NFN1 T9 ON T2."SeqCode" = T9."SeqCode"
WHERE T0."Canceled" = 'N' AND (T8."FormatCode" = :FormatCode OR :FormatCode = '') AND (T8."AcctName" = :AcctName OR :AcctName = '') AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim)
),
IMP_NFE AS (
SELECT T0."AbsEntry", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('1','11') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('2','14') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '3' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('6','8') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "INSS", CAST(0 AS DECIMAL(38,19)) AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '5' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", CAST(0 AS DECIMAL(38,19)) AS "PIS", CAST(0 AS DECIMAL(38,19)) AS "COFINS", CAST(0 AS DECIMAL(38,19)) AS "IR", CAST(0 AS DECIMAL(38,19)) AS "ISS", CAST(0 AS DECIMAL(38,19)) AS "INSS", CAST(SUM(T0."WTAmnt") AS DECIMAL(38,19)) AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('4','13') GROUP BY T0."AbsEntry")
),
IMP_TOTAL_NFE AS (
SELECT T0."AbsEntry", SUM("PIS") AS "VLPIS", SUM("COFINS") AS "VLCOFINS", SUM("IR") AS "VLIR", SUM("ISS") AS "VLISS", SUM("INSS") AS "VLINSS", SUM("CSLL") AS "VLCSLL" FROM :IMP_NFE T0 GROUP BY T0."AbsEntry")
),
REGISTROS_NFE AS (
SELECT 	 
T0."Filial", T0."Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente", T0."Código Cliente", T0."Nome Cliente", T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída",
T0."Data de lançamento da NF de Saída", T0."Data de lançamento do Contas a Receber", T0."Valor da Transferência", T0."Data da Transferência", T0."Valor Bruto",
ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) AS "Valor PIS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) AS "Valor COFINS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) AS "Valor de IR Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) AS "Valor de ISS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) AS "Valor de INSS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor de CSLL Retido na NF",
T0."Valor Bruto" - ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor Líquido", 
T0."Multa / Juros", T0."Desconto concedido", T0."Valor Recebido", T0."Código de serviço", T0."Código da Conta Contábil", T0."Descrição Conta Contábil"
FROM :DOC_NFE T0 LEFT JOIN :IMP_TOTAL_NFE T1 ON T1."AbsEntry" = T0."Num Interno NF")
),
Exclusao AS (
SELECT distinct T0."OrigTrnsId" FROM "SBO_PTC_PRD"."CASE1" T0 INNER JOIN "SBO_PTC_PRD"."OCRD" T1 ON T0."ShortName" = T1."CardCode" INNER JOIN "SBO_PTC_PRD"."JDT1" T2 ON T0."TransId" = T2."TransId" AND T0."TransLine" = T2."Line_ID" INNER JOIN "SBO_PTC_PRD"."JDT1" T3 ON T0."TransId" = T3."TransId"
),
ResumoPTC AS (
SELECT t0."Filial", COALESCE(t8."TaxId0",t8."TaxId4",t8d."TaxId0",t8d."TaxId4",t8l."TaxId0",t8l."TaxId4") AS "CNPJ/CPF Fornecedor", t0."Código PN" AS "Código PN", t0."Nome PN" AS "Nome do Cliente", t0."Tipo Documento", t0."Número SAP", t0."Serial" AS "Num Nota", t0."Data LanÃ§amento", t0."Data Vencimento", t0."Saldo_Inicial" AS "Valor Bruto", CASE WHEN t7."WTType" = 'PIS' THEN t5."WTAmnt" ELSE 0.00 END "PIS RETIDO", CASE WHEN t7."WTType" = 'COFINS' THEN t5."WTAmnt" ELSE 0.00 END "COFINS RETIDO", CASE WHEN t7."WTType" = 'CSLL' THEN t5."WTAmnt" ELSE 0.00 END "CSLL RETIDO", CASE WHEN t7."WTType" = 'IRRF' THEN t5."WTAmnt" ELSE 0.00 END "IRRF RETIDO", CASE WHEN t7."WTType" = 'ISSF' THEN t5."WTAmnt" ELSE 0.00 END "ISS RETIDO", CASE WHEN t7."WTType" = 'INSS' THEN t5."WTAmnt" ELSE 0.00 END "INSS RETIDO", t0."Saldo_Inicial" AS "Valor Liquido", t0."Saldo Final" AS "Saldo", t9."FormatCode" as "Conta Despesa", t9."AcctName" as "Nome da Conta", IFNULL(t2."ItemCode",t2d."ItemCode") AS "Código Item", IFNULL(t2."Dscription",t2d."Dscription") AS "Descrição do Item", t9a."Ref1" as "Referencia 1 LCM"
FROM :OKS_TITULOS_03 as t0
LEFT JOIN OPCH AS t1 ON t1."DocNum" = t0."Número SAP" AND t0."Transtype" = t1."ObjType" 
LEFT JOIN PCH1 AS t2 ON t2."DocEntry" = t1."DocEntry" 
LEFT JOIN PCH5 AS t5 ON t5."AbsEntry" = t1."DocEntry" AND t2."LineNum" = t5."Doc1LineNo" 
LEFT JOIN OWHT AS t6 ON t6."WTCode" = t5."WTCode" 
LEFT JOIN OWTT AS t7 ON t7."WTTypeId" = t6."WTTypeId"  
LEFT JOIN CRD7 AS t8 ON t8."CardCode" = t1."CardCode" AND t1."ShipToCode" = t8."Address" AND t8."AddrType" ='S'
Left Join OACT as t9 ON t9."AcctCode" = t2."AcctCode"
LEFT JOIN ORPC AS t1d ON t1d."DocNum" = t0."Número SAP" AND t0."Transtype" = t1d."ObjType" 
LEFT JOIN RPC1 AS t2d ON t2d."DocEntry" = t1d."DocEntry" 
LEFT JOIN RPC5 AS t5d ON t5d."AbsEntry" = t1d."DocEntry" AND t2d."LineNum" = t5d."Doc1LineNo" 
LEFT JOIN OWHT AS t6d ON t6d."WTCode" = t5d."WTCode" 
LEFT JOIN OWTT AS t7d ON t7d."WTTypeId" = t6d."WTTypeId"  
LEFT JOIN CRD7 AS t8d ON t8d."CardCode" = t1d."CardCode" AND '' = t8d."Address" AND t8d."AddrType" ='S'
INNER JOIN OCRD AS tc ON tc."CardCode" = t0."Código PN"
LEFT JOIN CRD7 AS t8l ON t8l."CardCode" = tc."CardCode" AND '' = t8l."Address" AND t8l."AddrType" ='S'
LEFT JOIN OJDT AS t9a ON t9a."Number" = t0."Número SAP" AND t0."Transtype" = t9a."ObjType"
)

-- FINAL UNION ALL
SELECT * FROM (
SELECT 
    CAST(T0."Filial" AS INT) AS "Filial", 
    CAST(T0."Num. NF" AS BIGINT) AS "Num. NF", 
    CAST(T0."Num Interno NF" AS INT) AS "Num Interno NF", 
    CAST(T0."Num Contas a Receber" AS INT) AS "Num Contas a Receber", 
    CAST(T0."CNPJ Cliente" AS NVARCHAR(100)) AS "CNPJ/CPF", 
    CAST(T0."Código Cliente" AS NVARCHAR(100)) AS "Código PN", 
    CAST(T0."Nome Cliente" AS NVARCHAR(200)) AS "Nome PN",
    CAST(T0."Tipo de Documento" AS NVARCHAR(100)) AS "Tipo de Documento", 
    CAST(T0."Entrega" AS NVARCHAR(200)) AS "Entrega", 
    CAST(T0."Tipo Número Nota" AS NVARCHAR(100)) AS "Tipo Número Nota", 
    CAST(T0."Num. RPS" AS NVARCHAR(100)) AS "Num. RPS", 
    CAST(T0."Notas Saída" AS NVARCHAR(4000)) AS "Notas Saída", 
    CAST(T0."Data de lançamento da NF de Saída" AS DATE) AS "Data Lançamento", 
    CAST(T0."Data de lançamento do Contas a Receber" AS DATE) AS "Data Vencimento",
    CAST(T0."Valor Bruto" AS DECIMAL(38,19)) AS "Valor Bruto", 
    CAST(T0."Valor PIS Retido na NF" AS DECIMAL(38,19)) AS "PIS RETIDO", 
    CAST(T0."Valor COFINS Retido na NF" AS DECIMAL(38,19)) AS "COFINS RETIDO", 
    CAST(T0."Valor de CSLL Retido na NF" AS DECIMAL(38,19)) AS "CSLL RETIDO", 
    CAST(T0."Valor de IR Retido na NF" AS DECIMAL(38,19)) AS "IRRF RETIDO",
    CAST(T0."Valor de ISS Retido na NF" AS DECIMAL(38,19)) AS "ISS RETIDO", 
    CAST(T0."Valor de INSS Retido na NF" AS DECIMAL(38,19)) AS "INSS RETIDO", 
    CAST(T0."Valor Líquido" AS DECIMAL(38,19)) AS "Valor Líquido", 
    CAST(T0."Multa / Juros" AS DECIMAL(38,19)) AS "Multa / Juros", 
    CAST(T0."Desconto concedido" AS DECIMAL(38,19)) AS "Desconto concedido", 
    CAST(T0."Valor Recebido" AS DECIMAL(38,19)) AS "Valor Recebido", 
    CAST(T0."Código de serviço" AS NVARCHAR(100)) AS "Código de serviço",
    CAST(T0."Código da Conta Contábil" AS NVARCHAR(100)) AS "Código da Conta Contábil", 
    CAST(T0."Descrição Conta Contábil" AS NVARCHAR(200)) AS "Descrição Conta Contábil", 
    CAST(T0."Valor da Transferência" AS DECIMAL(38,19)) AS "Valor da Transferência", 
    CAST(T0."Data da Transferência" AS DATE) AS "Data da Transferência", 
    CAST(NULL AS DECIMAL(38,19)) AS "Saldo", 
    CAST(NULL AS NVARCHAR(100)) AS "Referencia 1 LCM", 
    CAST('Consulta_1' AS NVARCHAR(100)) AS "Origem"
FROM (
	SELECT T0.* FROM :REGISTROS_NFS T0
	UNION ALL SELECT T0.* FROM :REGISTROS_LCM T0
	UNION ALL SELECT T0.* FROM :REGISTROS_ADT T0
)
UNION ALL
SELECT * FROM (
SELECT
	CAST(t0."Filial" AS INT) AS "Filial", 
    CAST(NULL AS BIGINT) AS "Num. NF", 
    CAST(t0."Número SAP" AS INT) AS "Num Interno NF", 
    CAST(NULL AS INT) AS "Num Contas a Receber", 
    CAST(t0."CNPJ/CPF Fornecedor" AS NVARCHAR(100)) AS "CNPJ/CPF", 
    CAST(t0."Código PN" AS NVARCHAR(100)) AS "Código PN", 
    CAST(t0."Nome do Cliente" AS NVARCHAR(200)) AS "Nome PN",
	CAST(t0."Tipo Documento" AS NVARCHAR(100)) AS "Tipo Documento", 
    CAST(NULL AS NVARCHAR(200)) AS "Entrega", 
    CAST(NULL AS NVARCHAR(100)) AS "Tipo Número Nota", 
    CAST(NULL AS NVARCHAR(100)) AS "Num. RPS", 
    CAST(NULL AS NVARCHAR(4000)) AS "Notas Saída", 
    CAST(t0."Data Lançamento" AS DATE) AS "Data Lançamento", 
    CAST(t0."Data Vencimento" AS DATE) AS "Data Vencimento",
	CAST(t0."Valor Bruto" AS DECIMAL(38,19)) AS "Valor Bruto", 
    CAST(SUM(t0."PIS RETIDO") AS DECIMAL(38,19)) AS "PIS RETIDO", 
    CAST(SUM(t0."COFINS RETIDO") AS DECIMAL(38,19)) AS "COFINS RETIDO", 
    CAST(SUM(t0."CSLL RETIDO") AS DECIMAL(38,19)) AS "CSLL RETIDO", 
    CAST(SUM(t0."IRRF RETIDO") AS DECIMAL(38,19)) AS "IRRF RETIDO",
	CAST(SUM(t0."ISS RETIDO") AS DECIMAL(38,19)) AS "ISS RETIDO", 
    CAST(SUM(t0."INSS RETIDO") AS DECIMAL(38,19)) AS "INSS RETIDO", 
    CAST(t0."Valor Liquido" AS DECIMAL(38,19)) AS "Valor Líquido", 
    CAST(NULL AS DECIMAL(38,19)) AS "Multa / Juros", 
    CAST(NULL AS DECIMAL(38,19)) AS "Desconto concedido", 
    CAST(NULL AS DECIMAL(38,19)) AS "Valor Recebido", 
    CAST(NULL AS NVARCHAR(100)) AS "Código de serviço",
	CAST(NULL AS NVARCHAR(100)) AS "Código da Conta Contábil", 
    CAST(NULL AS NVARCHAR(200)) AS "Descrição Conta Contábil", 
    CAST(NULL AS DECIMAL(38,19)) AS "Valor da Transferência", 
    CAST(NULL AS DATE) AS "Data da Transferência", 
    CAST(t0."Saldo" AS DECIMAL(38,19)) AS "Saldo", 
    CAST(t0."Referencia 1 LCM" AS NVARCHAR(100)) AS "Referencia 1 LCM", 
    CAST('Consulta_2' AS NVARCHAR(100)) AS "Origem"
FROM :ResumoPTC AS t0
GROUP BY t0."Filial", t0."CNPJ/CPF Fornecedor", t0."Código PN", t0."Nome do Cliente", t0."Tipo Documento", t0."Número SAP", t0."Num Nota", t0."Data LanÃ§amento", t0."Data Vencimento", t0."Valor Bruto", t0."Valor Liquido", t0."Saldo", t0."Referencia 1 LCM"
);

END;

