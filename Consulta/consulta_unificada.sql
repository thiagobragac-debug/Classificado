/* 
  ========================================================================
  CONSULTA UNIFICADA (CONTAS A RECEBER E CONTAS A PAGAR)
  ========================================================================
  Abaixo está a estrutura unificada. A lógica interna das duas consultas
  foi preservada. Como elas possuem colunas diferentes, criei um padrão
  único de colunas para o resultado final, preenchendo com nulo (NULL) ou 
  zero (0) as colunas que são exclusivas de uma das consultas.
*/

-- VARIÁVEIS INICIAIS GERAIS (Ajuste conforme sua necessidade de parâmetros)
declare FormatCode NVARCHAR(100);
declare AcctName NVARCHAR(100);
declare DocDateIni NVARCHAR(100);
declare DocDateFim NVARCHAR(100);
declare Contador int;

FormatCode := '[%0]';
AcctName := '[%3]';
DocDateIni := [%1];
DocDateFim := [%2];
Contador := 0;

-------------------------------------------------------------------------
-- PARTE 1: LÓGICA DA CONSULTA 1 (Contas a Receber / NFS / LCM / ADT / NFE)
-------------------------------------------------------------------------
DOC_NFS_TMP = SELECT 	 
T2."BPLId" AS "Filial",
T2."DocNum" AS "Num. NF",
T2."DocEntry" AS "Num Interno NF",
T0."DocNum" AS "Num Contas a Receber",
T0."DocEntry" AS "Num interno CR",
T2."VATRegNum" AS "CNPJ Cliente",
T2."CardCode" AS "Código Cliente",
T2."CardName" AS "Nome Cliente",
'NFS' AS "Tipo de Documento",
T22."BaseRef" AS "Entrega",
CASE WHEN T2."SeqCode" = -1 THEN 'Manual' ELSE 'NFSe' END AS "Tipo Número Nota",
CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS "Num. RPS",
CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS "Notas Saída",
T2."DocDate" AS "Data de lançamento da NF de Saída",
T0."DocDate" AS "Data de lançamento do Contas a Receber",
T0."DocTotal" AS "Valor da Transferência",
T0."TrsfrDate" AS "Data da Transferência",
T4."InsTotal" + ROUND((T4."InsTotal" * T2."WTSum" / T2."DocTotal"),2) AS "Valor Bruto",
T0."BcgSum" + T0."UndOvDiff" AS "Encargos",
T1."SumApplied" - T1."WtAppld" AS "Pago até nota fiscal (IR)",
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
WHERE T0."Canceled" = 'N' AND (T5."FormatCode" = :FormatCode OR :FormatCode = '') AND (T5."AcctName" = :AcctName OR :AcctName = '') AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim;

DOC_NFS_ENCARGOS = SELECT
T1."Num interno CR",
MIN(T0."DocEntry") 	AS "DocEntry",
MIN(T0."InvoiceId")	AS "InvoiceId"
FROM RCT2 T0
INNER JOIN :DOC_NFS_TMP T1 ON T0."DocNum" = T1."Num interno CR"
GROUP BY T1."Num interno CR";

DOC_NFS = SELECT
T0."Filial", T0."Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente", T0."Código Cliente", T0."Nome Cliente",
T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída", T0."Data de lançamento da NF de Saída",
T0."Data de lançamento do Contas a Receber", T0."Valor da Transferência", T0."Data da Transferência", T0."Valor Bruto",
CASE WHEN T0."DocEntry" = IFNULL(T1."DocEntry",-1) AND T0."InvoiceId" = IFNULL(T1."InvoiceId",-1) THEN T0."Encargos" ELSE 0 END AS "Multa / Juros",
T0."Desconto concedido",
T0."Pago até nota fiscal (IR)" + (CASE WHEN T0."DocEntry"= IFNULL(T1."DocEntry",-1) AND T0."InvoiceId"=IFNULL(T1."InvoiceId",-1) THEN T0."Encargos" ELSE 0 END) AS "Valor Recebido",
T0."Código de serviço", T0."Código da Conta Contábil", T0."Descrição Conta Contábil", T0."SumApplied", T0."DocTotal"
FROM :DOC_NFS_TMP T0
LEFT JOIN :DOC_NFS_ENCARGOS T1 ON T0."Num interno CR" = T1."Num interno CR";

IMP_NFS0 = SELECT T0."AbsEntry", SUM(T0."WTAmnt") AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('1','11') GROUP BY T0."AbsEntry";
IMP_NFS1 = SELECT T0."AbsEntry", 0 AS "PIS", SUM(T0."WTAmnt") AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('2','14') GROUP BY T0."AbsEntry";
IMP_NFS2 = SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", SUM(T0."WTAmnt") AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '3' GROUP BY T0."AbsEntry";
IMP_NFS3 = SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", SUM(T0."WTAmnt") AS "ISS", 0 AS "INSS", 0 AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('6','8') GROUP BY T0."AbsEntry";
IMP_NFS4 = SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", SUM(T0."WTAmnt") AS "INSS", 0 AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '5' GROUP BY T0."AbsEntry";
IMP_NFS5 = SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", SUM(T0."WTAmnt") AS "CSLL"
FROM INV5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFS T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('4','13') GROUP BY T0."AbsEntry";

IMP_NFS = Select t0.* From :IMP_NFS0 as t0 Union all Select t0.* From :IMP_NFS1 as t0 Union all Select t0.* From :IMP_NFS2 as t0 Union all
Select t0.* From :IMP_NFS3 as t0 Union all Select t0.* From :IMP_NFS4 as t0 Union all Select t0.* From :IMP_NFS5 as t0;

IMP_TOTAL_NFS = (SELECT T0."AbsEntry", SUM("PIS") AS "VLPIS", SUM("COFINS") AS "VLCOFINS", SUM("IR") AS "VLIR", SUM("ISS") AS "VLISS", SUM("INSS") AS "VLINSS", SUM("CSLL") AS "VLCSLL" FROM :IMP_NFS T0 GROUP BY T0."AbsEntry");

REGISTROS_NFS = (SELECT 	 
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
FROM :DOC_NFS T0 LEFT JOIN :IMP_TOTAL_NFS T1 ON T1."AbsEntry" = T0."Num Interno NF");

REGISTROS_LCM = (SELECT 	
T0."BPLId" AS "Filial", T2."TransId" AS "Num. NF", T2."TransId" AS "Num Interno NF", T0."DocNum" AS "Num Contas a Receber", T0."VATRegNum" AS "CNPJ Cliente", T0."CardCode" AS "Código Cliente", T0."CardName" AS "Nome Cliente",
'LCM' AS "Tipo de Documento", ' ' AS "Entrega", '' AS "Tipo Número Nota", '' AS "Num. RPS", '' as "Notas Saída", T2."RefDate" AS "Data de lançamento da NF de Saída", T0."DocDate" AS "Data de lançamento do Contas a Receber",
T0."DocTotal" AS "Valor da Transferência", T0."TrsfrDate" AS "Data da Transferência", T1."SumApplied" AS "Valor Bruto", 0 AS "Valor PIS Retido na NF", 0 AS "Valor COFINS Retido na NF", 0 AS "Valor de IR Retido na NF",
0 AS "Valor de ISS Retido na NF", 0 AS "Valor de INSS Retido na NF", 0 AS "Valor de CSLL Retido na NF", T1."SumApplied" AS "Valor Líquido",
CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') THEN T0."BcgSum" + T0."UndOvDiff" ELSE 0 END AS "Multa / Juros",
T1."DcntSum" AS "Desconto concedido",
T1."SumApplied" - T1."WtAppld" + CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND S0."InvType" = '30') THEN T0."BcgSum" + T0."UndOvDiff" ELSE 0 END AS "Valor Recebido",
'' AS "Código de serviço", T3."FormatCode" AS "Código da Conta Contábil", T3."AcctName" AS "Descrição Conta Contábil"
FROM ORCT T0 INNER JOIN RCT2 T1 ON T1."DocNum" = T0."DocEntry" INNER JOIN OJDT T2 ON T1."DocEntry" = T2."TransId" INNER JOIN OACT T3 ON T0."TrsfrAcct" = T3."AcctCode" WHERE T0."Canceled" = 'N' AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim);

DOC_ADT = (SELECT 	 
T2."BPLId" AS "Filial", T2."DocNum" AS "Num. NF", T2."DocEntry" AS "Num Interno NF", T0."DocNum" AS "Num Contas a Receber", T2."VATRegNum" AS "CNPJ Cliente", T2."CardCode" AS "Código Cliente", T2."CardName" AS "Nome Cliente",
'ADT' AS "Tipo de Documento", ' ' AS "Entrega", CASE WHEN T2."SeqCode" = -1 THEN 'Manual' ELSE T9."SeqName" END AS "Tipo Número Nota",
CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS "Num. RPS",
(select string_agg(Tc."Serial",',') from ODPI Ta inner JOIN INV11 Tb ON Tb."BaseAbs" = Ta."DocEntry" and Tb."LineType" = 'D' inner JOIN OINV Tc ON Tc."DocEntry" = Tb."DocEntry" where Tc."CANCELED" = 'N' and Ta."DocEntry" = T2."DocEntry") as "Notas Saída",
T2."DocDate" AS "Data de lançamento da NF de Saída", T0."DocDate" AS "Data de lançamento do Contas a Receber", T0."DocTotal" AS "Valor da Transferência", T0."TrsfrDate" AS "Data da Transferência",
T4."InsTotal" + ROUND((T4."InsTotal" * T2."WTSum" / T2."DocTotal"),2) AS "Valor Bruto",
CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") THEN T0."BcgSum" + T0."UndOvDiff" ELSE 0 END AS "Multa / Juros",
T1."DcntSum" AS "Desconto concedido",
T1."SumApplied" - T1."WtAppld" + CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry") THEN T0."BcgSum" + T0."UndOvDiff" ELSE 0 END AS "Valor Recebido",
(SELECT S7."U_SKILL_LisSer" FROM OITM S7 INNER JOIN (SELECT S0."ItemCode" FROM DPI1 S0 WHERE S0."DocEntry" = T2."DocEntry" AND S0."LineNum" = (SELECT MIN(S1."LineNum") FROM DPI1 S1 WHERE S1."DocEntry" = T2."DocEntry")) S2 ON S7."ItemCode" = S2."ItemCode" ) AS "Código de serviço", 
T8."FormatCode" AS "Código da Conta Contábil", T8."AcctName" AS "Descrição Conta Contábil", T1."SumApplied", T2."DocTotal"
FROM ORCT T0 INNER JOIN RCT2 T1 ON T1."DocNum" = T0."DocEntry" INNER JOIN ODPI T2 ON T1."DocEntry" = T2."DocEntry" AND T1."InvType" = T2."ObjType" INNER JOIN DPI6 T4 ON T2."DocEntry" = T4."DocEntry" AND T1."InstId" = T4."InstlmntID"
LEFT JOIN "@SKILL_NOFSNFSE001" T6 ON T2."DocEntry" = T6."U_NrDocEntry" AND IFNULL(CAST(T6."U_UltErro" AS VARCHAR(50)),'') = '' INNER JOIN OACT T8 ON T0."TrsfrAcct" = T8."AcctCode" LEFT JOIN NFN1 T9 ON T2."SeqCode" = T9."SeqCode"
WHERE T0."Canceled" = 'N' AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim);

IMP_ADT = (SELECT T0."AbsEntry", SUM(T0."WTAmnt") AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('1','11') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", SUM(T0."WTAmnt") AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('2','14') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", SUM(T0."WTAmnt") AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '3' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", SUM(T0."WTAmnt") AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('6','8') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", SUM(T0."WTAmnt") AS "INSS", 0 AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '5' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", SUM(T0."WTAmnt") AS "CSLL" FROM DPI5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_ADT T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('4','13') GROUP BY T0."AbsEntry");

IMP_TOTAL_ADT = (SELECT T0."AbsEntry", SUM("PIS") AS "VLPIS", SUM("COFINS") AS "VLCOFINS", SUM("IR") AS "VLIR", SUM("ISS") AS "VLISS", SUM("INSS") AS "VLINSS", SUM("CSLL") AS "VLCSLL" FROM :IMP_ADT T0 GROUP BY T0."AbsEntry");

REGISTROS_ADT = (SELECT 
T0."Filial", T0."Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente", T0."Código Cliente", T0."Nome Cliente",
T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída", T0."Data de lançamento da NF de Saída", T0."Data de lançamento do Contas a Receber",
T0."Valor da Transferência", T0."Data da Transferência", T0."Valor Bruto",
ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) AS "Valor PIS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) AS "Valor COFINS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) AS "Valor de IR Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) AS "Valor de ISS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) AS "Valor de INSS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor de CSLL Retido na NF",
T0."Valor Bruto" - ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor Líquido", 
T0."Multa / Juros", T0."Desconto concedido", T0."Valor Recebido", T0."Código de serviço", T0."Código da Conta Contábil", T0."Descrição Conta Contábil"
FROM :DOC_ADT T0 LEFT JOIN :IMP_TOTAL_ADT T1 ON T1."AbsEntry" = T0."Num Interno NF");

DOC_NFE = (SELECT 	 
T2."BPLId" AS "Filial", T2."DocNum" AS "Num. NF", T2."DocEntry" AS "Num Interno NF", T0."DocNum" AS "Num Contas a Receber", T2."VATRegNum" AS "CNPJ Cliente", T2."CardCode" AS "Código Cliente", T2."CardName" AS "Nome Cliente",
'NFE' AS "Tipo de Documento", ' ' AS "Entrega", CASE WHEN T2."SeqCode" = -1 THEN 'Manual' ELSE T9."SeqName" END AS "Tipo Número Nota",
CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS "Num. RPS",
CASE WHEN T2."SeqCode" = -1 THEN CAST(T2."Serial" AS VARCHAR(10)) ELSE IFNULL(T6."U_NrRetNFSE",CAST(T2."Serial" AS VARCHAR(10))) END AS "Notas Saída",
T2."DocDate" AS "Data de lançamento da NF de Saída", T0."DocDate" AS "Data de lançamento do Contas a Receber", T0."DocTotal" AS "Valor da Transferência", T0."TrsfrDate" AS "Data da Transferência",
(T4."InsTotal" + ROUND((T4."InsTotal" * T2."WTSum" / T2."DocTotal"),2)) * -1 AS "Valor Bruto",
CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM RCT2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") THEN T0."BcgSum" + T0."UndOvDiff" ELSE 0 END AS "Multa / Juros",
T1."DcntSum" AS "Desconto concedido",
(T1."SumApplied" - T1."WtAppld" + CASE WHEN T1."DocEntry" = (SELECT MIN(S0."DocEntry") FROM VPM2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") AND T1."InvoiceId" = (SELECT MIN(S0."InvoiceId") FROM VPM2 S0 WHERE S0."DocNum" = T0."DocEntry" AND T1."InvType" = S0."ObjType") THEN T0."BcgSum" + T0."UndOvDiff" ELSE 0 END) * -1 AS "Valor Recebido",
(SELECT S7."U_SKILL_LisSer" FROM OITM S7 INNER JOIN (SELECT S0."ItemCode" FROM PCH1 S0 WHERE S0."DocEntry" = T2."DocEntry" AND S0."LineNum" = (SELECT MIN(S1."LineNum") FROM PCH1 S1 WHERE S1."DocEntry" = T2."DocEntry")) S2 ON S7."ItemCode" = S2."ItemCode" ) AS "Código de serviço", 
T8."FormatCode" AS "Código da Conta Contábil", T8."AcctName" AS "Descrição Conta Contábil", T1."SumApplied", T2."DocTotal"
FROM OVPM T0 INNER JOIN VPM2 T1 ON T1."DocNum" = T0."DocEntry" INNER JOIN OPCH T2 ON T1."DocEntry" = T2."DocEntry" AND T1."InvType" = T2."ObjType" INNER JOIN PCH6 T4 ON T2."DocEntry" = T4."DocEntry" AND T1."InstId" = T4."InstlmntID"
LEFT JOIN "@SKILL_NOFSNFSE001" T6 ON CAST(T2."DocEntry" as nvarchar(100)) = T6."U_NrDocEntry" AND IFNULL(CAST(T6."U_UltErro" AS VARCHAR(50)),'') = '' INNER JOIN OACT T8 ON T0."TrsfrAcct" = T8."AcctCode" LEFT JOIN NFN1 T9 ON T2."SeqCode" = T9."SeqCode"
WHERE T0."Canceled" = 'N' AND (T8."FormatCode" = :FormatCode OR :FormatCode = '') AND (T8."AcctName" = :AcctName OR :AcctName = '') AND T0."DocDate" BETWEEN :DocDateIni AND :DocDateFim);

IMP_NFE = (SELECT T0."AbsEntry", SUM(T0."WTAmnt") AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('1','11') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", SUM(T0."WTAmnt") AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('2','14') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", SUM(T0."WTAmnt") AS "IR", 0 AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '3' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", SUM(T0."WTAmnt") AS "ISS", 0 AS "INSS", 0 AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('6','8') GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", SUM(T0."WTAmnt") AS "INSS", 0 AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" = '5' GROUP BY T0."AbsEntry"
UNION ALL SELECT T0."AbsEntry", 0 AS "PIS", 0 AS "COFINS", 0 AS "IR", 0 AS "ISS", 0 AS "INSS", SUM(T0."WTAmnt") AS "CSLL" FROM PCH5 T0 INNER JOIN OWHT T1 ON T0."WTCode" = T1."WTCode" INNER JOIN :DOC_NFE T2 ON T0."AbsEntry" = T2."Num Interno NF" WHERE T0."WTTypeId" IN ('4','13') GROUP BY T0."AbsEntry");

IMP_TOTAL_NFE = (SELECT T0."AbsEntry", SUM("PIS") AS "VLPIS", SUM("COFINS") AS "VLCOFINS", SUM("IR") AS "VLIR", SUM("ISS") AS "VLISS", SUM("INSS") AS "VLINSS", SUM("CSLL") AS "VLCSLL" FROM :IMP_NFE T0 GROUP BY T0."AbsEntry");

REGISTROS_NFE = (SELECT 	 
T0."Filial", T0."Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente", T0."Código Cliente", T0."Nome Cliente", T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída",
T0."Data de lançamento da NF de Saída", T0."Data de lançamento do Contas a Receber", T0."Valor da Transferência", T0."Data da Transferência", T0."Valor Bruto",
ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) AS "Valor PIS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) AS "Valor COFINS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) AS "Valor de IR Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) AS "Valor de ISS Retido na NF",
ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) AS "Valor de INSS Retido na NF", ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor de CSLL Retido na NF",
T0."Valor Bruto" - ROUND((T0."SumApplied" * IFNULL(T1."VLPIS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCOFINS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLIR",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLISS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLINSS",0) / T0."DocTotal"),2) - ROUND((T0."SumApplied" * IFNULL(T1."VLCSLL",0) / T0."DocTotal"),2) AS "Valor Líquido", 
T0."Multa / Juros", T0."Desconto concedido", T0."Valor Recebido", T0."Código de serviço", T0."Código da Conta Contábil", T0."Descrição Conta Contábil"
FROM :DOC_NFE T0 LEFT JOIN :IMP_TOTAL_NFE T1 ON T1."AbsEntry" = T0."Num Interno NF");

CONSULTA_1 = SELECT 
    T0."Filial", CAST(T0."Num. NF" AS BIGINT) AS "Num. NF", T0."Num Interno NF", T0."Num Contas a Receber", T0."CNPJ Cliente" AS "CNPJ/CPF", T0."Código Cliente" AS "Código PN", T0."Nome Cliente" AS "Nome PN",
    T0."Tipo de Documento", T0."Entrega", T0."Tipo Número Nota", T0."Num. RPS", T0."Notas Saída", T0."Data de lançamento da NF de Saída" AS "Data Lançamento", T0."Data de lançamento do Contas a Receber" AS "Data Vencimento",
    T0."Valor Bruto", T0."Valor PIS Retido na NF" AS "PIS RETIDO", T0."Valor COFINS Retido na NF" AS "COFINS RETIDO", T0."Valor de CSLL Retido na NF" AS "CSLL RETIDO", T0."Valor de IR Retido na NF" AS "IRRF RETIDO",
    T0."Valor de ISS Retido na NF" AS "ISS RETIDO", T0."Valor de INSS Retido na NF" AS "INSS RETIDO", T0."Valor Líquido", T0."Multa / Juros", T0."Desconto concedido", T0."Valor Recebido", T0."Código de serviço",
    T0."Código da Conta Contábil", T0."Descrição Conta Contábil", T0."Valor da Transferência", T0."Data da Transferência", CAST(NULL AS decimal(38,19)) AS "Saldo", CAST(NULL AS nvarchar(100)) AS "Referencia 1 LCM", 'Consulta_1' AS "Origem"
FROM (
	SELECT T0.* FROM :REGISTROS_NFS T0
	UNION ALL SELECT T0.* FROM :REGISTROS_LCM T0
	UNION ALL SELECT T0.* FROM :REGISTROS_ADT T0
	-- UNION ALL SELECT T0.* FROM :REGISTROS_NFE T0 
) T0;


-------------------------------------------------------------------------
-- PARTE 2: LÓGICA DA CONSULTA 2 (PROC_PTC_CP_ABERTA - Aging e CP)
-------------------------------------------------------------------------

-- Parâmetros locais equivalentes aos que a PROCEDURE usa
declare C2_DataIni DATE;
declare C2_DataFim DATE;
declare C2_CardCodeIni NVARCHAR(20);
declare C2_CardCodeFim NVARCHAR(20);
declare CardType NVARCHAR(1);
declare Processamento NVARCHAR(1);
declare TipoExecucao NVARCHAR(1);
declare SaldoZero NVARCHAR(1);
declare VencimentoIni DATE;
declare VencimentoFim DATE;
declare BPLIdIni INT;
declare BPLIdFim INT;
declare BPLIdSTD INT;

Processamento := '0';  
TipoExecucao := '1';  
BPLIdIni := 0;
BPLIdFim := 999;
VencimentoIni := '19000101';
VencimentoFim := '20991231';
CardType := 'S';
SaldoZero := 'N';

-- Supondo que você mapeie as datas globais para as datas da procedure 2:
C2_DataIni := CAST(:DocDateIni AS DATE);
C2_DataFim := CAST(:DocDateFim AS DATE);
-- Deixe os filtros de parceiro abertos ou passe via parâmetros
C2_CardCodeIni := (select min(t9."CardCode") from "SBO_PTC_PRD"."OCRD" as t9 where t9."CardType" = :CardType or :CardType = '*');
C2_CardCodeFim := (select max(t9."CardCode") from "SBO_PTC_PRD"."OCRD" as t9 where t9."CardType" = :CardType or :CardType = '*');
BPLIdSTD := ifnull((SELECT top 1 t0."BPLId" from "SBO_PTC_PRD"."OBPL" as t0 where t0."MainBPL" = 'Y' and t0."Disabled" = 'N'),1);

Exclusao = SELECT distinct T0."OrigTrnsId" FROM "SBO_PTC_PRD"."CASE1" T0 INNER JOIN "SBO_PTC_PRD"."OCRD" T1 ON T0."ShortName" = T1."CardCode" INNER JOIN "SBO_PTC_PRD"."JDT1" T2 ON T0."TransId" = T2."TransId" AND T0."TransLine" = T2."Line_ID" INNER JOIN "SBO_PTC_PRD"."JDT1" T3 ON T0."TransId" = T3."TransId";
Exclusao1 = select t1."TransId", t1."Line_ID", t1."ShortName" ,t1."Debit", t1."Credit", t1."BalDueDeb", t1."BalDueCred", t3."ReconNum", t4."OrigTrnsId" from "SBO_PTC_PRD"."OJDT" as t0 inner join "SBO_PTC_PRD"."JDT1" as t1 on t1."TransId" = t0."TransId" inner join "SBO_PTC_PRD"."OCRD" as t2 on t2."CardCode" = t1."ShortName" left outer join "SBO_PTC_PRD"."ITR1" as t3 on t3."TransId" = t1."TransId" and t3."TransRowId" = t1."Line_ID" left outer join :Exclusao as t4 on t4."OrigTrnsId" = t1."TransId" where t1."BalDueDeb" + t1."BalDueCred" = 0 and ( t3."ReconNum" is null and t4."OrigTrnsId" is null); 

DocumentosOJDT = select :C2_DataIni as "DataIni", :C2_DataFim as "DataFim", t10."CardCode" as "CardCode_jdt1", t10."CardName", t13."BPLId" as "BPLId_jdt1", t13."BPLName", t0."TransId" as "TransId_ojdt", t1."Line_ID" as "Line_ID_jdt1", cast(t0."RefDate" as date) as "RefDate_ojdt", cast(t1."DueDate" as date) as "DueDate_jdt1", t0."TransType" as "TransType_ojdt", CASE when t0."TransType" = '13' then 'NFS' when t0."TransType" = '14' then 'NFSDEV' when t0."TransType" = '18' then 'NFE' when t0."TransType" = '19' then 'NFEDEV' when t0."TransType" = '24' then 'CR' when t0."TransType" = '46' then 'CP' when t0."TransType" = '30' then 'LCM' when t0."TransType" = '203' then 'ADTO-Cli' when t0."TransType" = '204' then 'ADTO-For' when t0."TransType" = '182' then 'BT' when t0."TransType" = '243000002' then 'LCM-TW' when t0."TransType" = '243000003' then 'LCM-TA' else '???' end as "TransType Name", t0."BaseRef" as "BaseRef_ojdt", (t1."Debit" - t1."Credit") as "Valor_jdt1", case when t10."CardType" = 'C' then -(ifnull(t30."NoDocSum",0.00) + ifnull(t40."NoDocSum",0.00)) else (ifnull(t30."NoDocSum",0.00) + ifnull(t40."NoDocSum",0.00)) end as "Valor_Adto", (t1."Debit" - t1."Credit") as "Valor_jdt1_usado", t1."ShortName" as "ShortName_jdt1", t10."CardType" as "CardType_jdt1", CASE when t10."CardType" = 'C' then 'Cliente' when t10."CardType" = 'S' then 'Fornecedor' else '???' end as "CardType Name", t1."LineMemo" as "Obs Diário", CASE when t20."Serial" is not null then t20."Serial" when t21."Serial" is not null then t21."Serial" when t22."Serial" is not null then t22."Serial" when t23."Serial" is not null then t23."Serial" else null end as "Serial", CASE when t20b."AbsEntry" is not null then t20b."NfmName" when t21b."AbsEntry" is not null then t21b."NfmName" when t22b."AbsEntry" is not null then t22b."NfmName" when t23b."AbsEntry" is not null then t23b."NfmName" else null end as "Model", CASE when t20."SeqCode" is not null then (case when ifnull(t20."SeqCode",0) <> -2 then t20a."SeqName" else 'Externo' end) when t21."SeqCode" is not null then (case when ifnull(t21."SeqCode",0) <> -2 then t21a."SeqName" else 'Externo' end) when t22."SeqCode" is not null then (case when ifnull(t22."SeqCode",0) <> -2 then t22a."SeqName" else 'Externo' end) when t23."SeqCode" is not null then (case when ifnull(t23."SeqCode",0) <> -2 then t23a."SeqName" else 'Externo' end) else null end as "SeqName"
from "SBO_PTC_PRD"."OJDT" as t0 inner join "SBO_PTC_PRD"."JDT1" as t1 on t0."TransId" = t1."TransId" inner join "SBO_PTC_PRD"."OCRD" as t10 on t10."CardCode" = t1."ShortName" and ( t10."CardType" = :CardType or :CardType = '*') left outer join :Exclusao as t11 on t11."OrigTrnsId" = t0."TransId" left outer join :Exclusao1 as t12 on t12."TransId" = t1."TransId" and t12."Line_ID" = t1."Line_ID" left outer join "SBO_PTC_PRD"."OBPL"  as t13 on t13."BPLId" = ifnull(t1."BPLId",:BPLIdSTD) left outer join "SBO_PTC_PRD"."OINV" as t20 on t20."DocNum" = t0."BaseRef" and t0."RefDate" = t20."DocDate" and t0."TransType" = '13' left outer join "SBO_PTC_PRD"."NFN1" as t20a on t20a."SeqCode" = t20."SeqCode" left outer join "SBO_PTC_PRD"."ONFM" as t20b on t20b."AbsEntry" = t20."Model" left outer join "SBO_PTC_PRD"."ORIN" as t21 on t21."DocNum" = t0."BaseRef" and t0."RefDate" = t21."DocDate" and t0."TransType" = '14' left outer join "SBO_PTC_PRD"."NFN1" as t21a on t21a."SeqCode" = t21."SeqCode" left outer join "SBO_PTC_PRD"."ONFM" as t21b on t21b."AbsEntry" = t20."Model" left outer join "SBO_PTC_PRD"."OPCH" as t22 on t22."DocNum" = t0."BaseRef" and t0."RefDate" = t22."DocDate" and t0."TransType" = '18' left outer join "SBO_PTC_PRD"."NFN1" as t22a on t22a."SeqCode" = t22."SeqCode" left outer join "SBO_PTC_PRD"."ONFM" as t22b on t22b."AbsEntry" = t20."Model" left outer join "SBO_PTC_PRD"."ORPC" as t23 on t23."DocNum" = t0."BaseRef" and t0."RefDate" = t23."DocDate" and t0."TransType" = '19' left outer join "SBO_PTC_PRD"."NFN1" as t23a on t23a."SeqCode" = t23."SeqCode" left outer join "SBO_PTC_PRD"."ONFM" as t23b on t23b."AbsEntry" = t20."Model" left outer join "SBO_PTC_PRD"."ORCT" as t30 on t30."DocNum" = t0."BaseRef" and t0."RefDate" = t30."DocDate" and t0."TransType" = '24' left outer join "SBO_PTC_PRD"."OVPM" as t40 on t40."DocNum" = t0."BaseRef" and t0."RefDate" = t40."DocDate" and t0."TransType" = '46'
where t0."RefDate" <= :C2_DataFim and t10."CardCode" between :C2_CardCodeIni and :C2_CardCodeFim and ifnull(t1."BPLId",:BPLIdSTD) between :BPLIdIni and :BPLIdFim and t11."OrigTrnsId" is null and (t1."Debit" - t1."Credit") <> 0 and t12."TransId" is null;

BaixasOITR = select t2."TransId_ojdt", t2."Line_ID_jdt1", t0."ReconNum" as "ReconNum_oitr", t0."IsCard" as "IsCard_oitr", t0."ReconType" as "ReconType_oitr", cast(t0."ReconDate" as date) as "ReconDate_oitr", cast(t0."CreateDate" as date) as "CreateDate_oitr", t0."CreateTime" as "CreateTime_oitr", t0."ReconCurr" as "ReconCurr_oitr", t0."Canceled" as "Canceled_oitr", t0."CancelAbs" as "CancelAbs_oitr", t0."IsSystem" as "IsSystem_oitr", t0."InitObjAbs" as "InitObjAbs_oitr", t0."InitObjTyp" as "InitObjTyp_oitr", t0."ObjType" as "ObjType_oitr", t1."LineSeq" as "LineSeq_itr1", t1."TransId" as "TransId_itr1", t1."TransRowId" as "TransRowId_itr1", t1."SrcObjTyp" as "SrcObjTyp_itr1", t1."SrcObjAbs" as "SrcObjAbs_itr1", CASE when t1."SrcObjTyp" = '13' then 'NFS' when t1."SrcObjTyp" = '14' then 'NFSDEV' when t1."SrcObjTyp" = '18' then 'NFE' when t1."SrcObjTyp" = '19' then 'NFEDEV' when t1."SrcObjTyp" = '24' then 'CR' when t1."SrcObjTyp" = '46' then 'CP' when t1."SrcObjTyp" = '30' then 'LCM' when t1."SrcObjTyp" = '203' then 'ADTO-Cli' when t1."SrcObjTyp" = '204' then 'ADTO-For' when t1."SrcObjTyp" = '182' then 'BT' when t1."SrcObjTyp" = '243000002' then 'LCM-TW' when t1."SrcObjTyp" = '243000003' then 'LCM-TA' else '???' end as "TransType Name", ifnull(t1."ReconSum",0) as "ReconSum_itr1", ifnull(CASE when t1."IsCredit" = 'D' then (-1)*t1."ReconSum" else t1."ReconSum" end,0) as "ReconSum_itr1_DC", t1."IsCredit" as "IsCredit_itr1"
from "SBO_PTC_PRD"."OITR" as t0 inner join "SBO_PTC_PRD"."ITR1" as t1 on t1."ReconNum"= t0."ReconNum" and t0."ReconDate" <= :C2_DataFim inner join :DocumentosOJDT as t2 on t2."TransId_ojdt" = t1."TransId" and t2."Line_ID_jdt1" = t1."TransRowId" left outer join "SBO_PTC_PRD"."JDT1" as t5 on t5."TransId" = t1."TransId" and t5."Line_ID" = t1."TransRowId" left outer join "SBO_PTC_PRD"."OBPL" as t6 on t6."BPLId" = ifnull(t5."BPLId",:BPLIdSTD)
where ifnull(t6."BPLId",:BPLIdSTD) between :BPLIdIni and :BPLIdFim;

HORIZONTE = select t0."U_P1" as "P1", t0."U_P2" as "P2", t0."U_P3" as "P3", t0."U_F1" as "F1", t0."U_F2" as "F2", t0."U_F3" as "F3" from "SBO_PTC_PRD"."@OKS_FUNC_RELFIN" as t0 ;

OKS_TITULOS_01 = Select t0."CardCode_jdt1", t0."CardName", t0."BPLId_jdt1", t0."BPLName", t0."TransId_ojdt", t0."Line_ID_jdt1", t0."RefDate_ojdt", t0."DueDate_jdt1", (-1)*(select DAYS_BETWEEN (:C2_DataFim, t0."DueDate_jdt1") from DUMMY) as "Dias", t0."TransType_ojdt", t0."TransType Name", t0."BaseRef_ojdt", t0."Valor_jdt1", t0."ShortName_jdt1", t0."CardType_jdt1", t0."CardType Name", t0."Serial", t0."Model", t0."SeqName", t0."Obs Diário", sum(ifnull(t1."ReconSum_itr1_DC",0)) as "Valor_Baixas_Ini", t0."Valor_jdt1_usado", t0."Valor_jdt1_usado" + sum(ifnull(t1."ReconSum_itr1_DC",0)) as "Saldo_Ini", t0."Valor_Adto"
from :DocumentosOJDT as t0 left outer join :BaixasOITR as t1 on t1."TransId_itr1" = t0."TransId_ojdt" and t1."TransRowId_itr1" = t0."Line_ID_jdt1" and t1."ReconDate_oitr" < :C2_DataIni
group by t0."CardCode_jdt1", t0."CardName", t0."BPLId_jdt1", t0."BPLName", t0."TransId_ojdt", t0."Line_ID_jdt1", t0."RefDate_ojdt", t0."DueDate_jdt1", t0."TransType_ojdt", t0."TransType Name", t0."BaseRef_ojdt", t0."Valor_jdt1", t0."Valor_jdt1_usado", t0."ShortName_jdt1", t0."CardType_jdt1", t0."CardType Name", t0."Serial", t0."Model", t0."SeqName", t0."Obs Diário", t0."Valor_Adto";

OKS_TITULOS_02 = Select t0."TransId_ojdt", t0."Line_ID_jdt1", sum(ifnull(t1."ReconSum_itr1_DC",0)) as "Valor_Baixas_Fim", t0."Saldo_Ini" + sum(ifnull(t1."ReconSum_itr1_DC",0)) as "Saldo_Fim"
from :OKS_TITULOS_01 as t0 left outer join :BaixasOITR as t1 on t1."TransId_itr1" = t0."TransId_ojdt" and t1."TransRowId_itr1" = t0."Line_ID_jdt1" and t1."ReconDate_oitr" between :C2_DataIni and :C2_DataFim
where t0."Saldo_Ini" <> 0 group by t0."TransId_ojdt", t0."Line_ID_jdt1", t0."Saldo_Ini" ;

OKS_TITULOS_03 = select t1."BPLId_jdt1" as "BPLId", t1."BPLName" as "Filial", t1."TransId_ojdt" as "Número LCM", t1."Line_ID_jdt1" as "Linha LCM", t1."Line_ID_jdt1" + 1 as "VisOrder LCM", t1."TransType_ojdt" as "Transtype", t1."TransType Name" as "Tipo Documento", t1."BaseRef_ojdt" as "Número SAP", t1."Model", t1."SeqName" as "Tipo Serial", t1."Serial" as "Serial", t1."Obs Diário" as "Observação Diário", t1."CardCode_jdt1" as "Código PN", t1."CardName" as "Nome PN", t1."CardType_jdt1" as "Tipo PN", t1."CardType Name" as "Tipo PN Nome", t1."RefDate_ojdt" as "Data Lançamento", t1."DueDate_jdt1" as "Data Vencimento", t1."Dias" as "Dias", t1."Saldo_Ini" as "Saldo_Inicial", CASE when t1."RefDate_ojdt" >= :C2_DataIni then t1."Valor_jdt1" else 0 end as "Valor Entrada", ifnull(t0."Valor_Baixas_Fim",0) as "Valor Baixas", ifnull(t0."Saldo_Fim",0) as "Saldo Final"
from :OKS_TITULOS_01 as t1 left outer join :OKS_TITULOS_02 as t0 on t1."TransId_ojdt" = t0."TransId_ojdt" and t1."Line_ID_jdt1" = t0."Line_ID_jdt1" inner join :HORIZONTE as t2 on 1=1
where (( t0."Saldo_Fim" <> 0 and :SaldoZero = 'N' ) or :SaldoZero = 'Y') and t1."RefDate_ojdt" Between :C2_DataIni and :C2_DataFim and t1."DueDate_jdt1" Between :VencimentoIni and :VencimentoFim;

ResumoPTC = SELECT t0."Filial", COALESCE(t8."TaxId0",t8."TaxId4",t8d."TaxId0",t8d."TaxId4",t8l."TaxId0",t8l."TaxId4") AS "CNPJ/CPF Fornecedor", t0."Código PN" AS "Código PN", t0."Nome PN" AS "Nome do Cliente", t0."Tipo Documento", t0."Número SAP", t0."Serial" AS "Num Nota", t0."Data Lançamento", t0."Data Vencimento", t0."Saldo_Inicial" AS "Valor Bruto", CASE WHEN t7."WTType" = 'PIS' THEN t5."WTAmnt" ELSE 0.00 END "PIS RETIDO", CASE WHEN t7."WTType" = 'COFINS' THEN t5."WTAmnt" ELSE 0.00 END "COFINS RETIDO", CASE WHEN t7."WTType" = 'CSLL' THEN t5."WTAmnt" ELSE 0.00 END "CSLL RETIDO", CASE WHEN t7."WTType" = 'IRRF' THEN t5."WTAmnt" ELSE 0.00 END "IRRF RETIDO", CASE WHEN t7."WTType" = 'ISSF' THEN t5."WTAmnt" ELSE 0.00 END "ISS RETIDO", CASE WHEN t7."WTType" = 'INSS' THEN t5."WTAmnt" ELSE 0.00 END "INSS RETIDO", t0."Saldo_Inicial" AS "Valor Liquido", t0."Saldo Final" AS "Saldo", t9."FormatCode" as "Conta Despesa", t9."AcctName" as "Nome da Conta", IFNULL(t2."ItemCode",t2d."ItemCode") AS "Código Item", IFNULL(t2."Dscription",t2d."Dscription") AS "Descrição do Item", t9a."Ref1" as "Referencia 1 LCM"
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
LEFT JOIN OJDT AS t9a ON t9a."Number" = t0."Número SAP" AND t0."Transtype" = t9a."ObjType";

CONSULTA_2 = SELECT
	t0."Filial", CAST(NULL AS BIGINT) AS "Num. NF", CAST(t0."Número SAP" AS INT) AS "Num Interno NF", CAST(NULL AS INT) AS "Num Contas a Receber", t0."CNPJ/CPF Fornecedor" AS "CNPJ/CPF", t0."Código PN", t0."Nome do Cliente" as "Nome PN",
	t0."Tipo Documento", CAST(NULL AS nvarchar(200)) AS "Entrega", CAST(NULL AS nvarchar(100)) AS "Tipo Número Nota", CAST(NULL AS nvarchar(100)) AS "Num. RPS", CAST(NULL AS nvarchar(100)) AS "Notas Saída", t0."Data Lançamento", t0."Data Vencimento",
	t0."Valor Bruto", SUM(t0."PIS RETIDO") AS "PIS RETIDO", SUM(t0."COFINS RETIDO") AS "COFINS RETIDO", SUM(t0."CSLL RETIDO") AS "CSLL RETIDO", SUM(t0."IRRF RETIDO") AS "IRRF RETIDO",
	SUM(t0."ISS RETIDO") AS "ISS RETIDO", SUM(t0."INSS RETIDO") AS "INSS RETIDO", t0."Valor Liquido", CAST(NULL AS decimal(38,19)) AS "Multa / Juros", CAST(NULL AS decimal(38,19)) AS "Desconto concedido", CAST(NULL AS decimal(38,19)) AS "Valor Recebido", CAST(NULL AS nvarchar(100)) AS "Código de serviço",
	CAST(NULL AS nvarchar(100)) AS "Código da Conta Contábil", CAST(NULL AS nvarchar(100)) AS "Descrição Conta Contábil", CAST(NULL AS decimal(38,19)) AS "Valor da Transferência", CAST(NULL AS DATE) AS "Data da Transferência", t0."Saldo", t0."Referencia 1 LCM", 'Consulta_2' AS "Origem"
FROM :ResumoPTC AS t0
GROUP BY t0."Filial", t0."CNPJ/CPF Fornecedor", t0."Código PN", t0."Nome do Cliente", t0."Tipo Documento", t0."Número SAP", t0."Num Nota", t0."Data Lançamento", t0."Data Vencimento", t0."Valor Bruto", t0."Valor Liquido", t0."Saldo", t0."Referencia 1 LCM";

-------------------------------------------------------------------------
-- PARTE FINAL: UNIFICAR TUDO (UNION ALL)
-------------------------------------------------------------------------
RESULTADO_FINAL = 
SELECT * FROM :CONSULTA_1
UNION ALL
SELECT * FROM :CONSULTA_2;

SELECT * FROM :RESULTADO_FINAL;
