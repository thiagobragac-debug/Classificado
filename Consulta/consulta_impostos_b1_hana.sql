-- ====================================================================================
-- Consulta de Impostos (Pivotados em Colunas) - Entradas e Saídas - SAP B1 HANA
-- ====================================================================================

/*SELECT FROM [dbo].[OPCH] T0*/
/*WHERE*/

WITH 
-- ==============================================================================
-- 1. CTE BASE DE DADOS: NOTAS DE ENTRADA
-- ==============================================================================
CTE_BASE_ENTRADAS AS (
    SELECT 
        'Entrada' AS "Tipo Documento",
        T0."DocEntry",
        T0."DocNum" AS "Nº Documento",
        T0."DocDate" AS "Data Lançamento",
        T0."CardCode" AS "Cód. PN",
        T0."CardName" AS "Nome PN",
        T1."LineNum" + 1 AS "Linha",
        T1."ItemCode" AS "Cód. Item",
        T1."Dscription" AS "Descrição Item",
        T1."Quantity" AS "Quantidade",
        T1."LineTotal" AS "Total Linha",
        T1."TaxCode" AS "Cód. Imposto"
    FROM OPCH T0
    INNER JOIN PCH1 T1 ON T0."DocEntry" = T1."DocEntry"
    WHERE T0."CANCELED" = 'N'
      -- Filtro de Data do SAP B1
      AND T0."DocDate" >= '[%0]' 
      AND T0."DocDate" <= '[%1]'
),
-- ==============================================================================
-- 2. CTE IMPOSTOS REGULARES PIVOTADOS: ENTRADA
-- ==============================================================================
CTE_IMPOSTOS_ENTRADA AS (
    SELECT 
        T1."DocEntry",
        T1."LineNum",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ICMS%' THEN T2."TaxSum" END) AS "Vlr ICMS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ICMS%' THEN T3."PurchTax" END) AS "Conta ICMS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%IPI%' THEN T2."TaxSum" END) AS "Vlr IPI",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%IPI%' THEN T3."PurchTax" END) AS "Conta IPI",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%PIS%' THEN T2."TaxSum" END) AS "Vlr PIS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%PIS%' THEN T3."PurchTax" END) AS "Conta PIS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%COF%' THEN T2."TaxSum" END) AS "Vlr COFINS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%COF%' THEN T3."PurchTax" END) AS "Conta COFINS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ISS%' THEN T2."TaxSum" END) AS "Vlr ISS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ISS%' THEN T3."PurchTax" END) AS "Conta ISS"
    FROM PCH1 T1
    INNER JOIN PCH4 T2 ON T1."DocEntry" = T2."DocEntry" AND T1."LineNum" = T2."LineNum"
    LEFT JOIN STC1 T5 ON T1."TaxCode" = T5."STCCode" AND T2."staType" = T5."STAType"
    LEFT JOIN OSTA T3 ON T5."STACode" = T3."Code"
    GROUP BY T1."DocEntry", T1."LineNum"
),
-- ==============================================================================
-- 3. CTE RETENÇÕES PIVOTADAS: ENTRADA (Nível Cabeçalho)
-- ==============================================================================
CTE_RETENCOES_ENTRADA AS (
    SELECT 
        T0."DocEntry",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%IRRF%' OR UPPER(T3."WTName") LIKE '%IR %' THEN T2."WTAmnt" END) AS "Vlr Ret IRRF",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%IRRF%' OR UPPER(T3."WTName") LIKE '%IR %' THEN T3."Account" END) AS "Conta Ret IRRF",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%INSS%' THEN T2."WTAmnt" END) AS "Vlr Ret INSS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%INSS%' THEN T3."Account" END) AS "Conta Ret INSS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%ISS%' THEN T2."WTAmnt" END) AS "Vlr Ret ISS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%ISS%' THEN T3."Account" END) AS "Conta Ret ISS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%PIS%' THEN T2."WTAmnt" END) AS "Vlr Ret PIS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%PIS%' THEN T3."Account" END) AS "Conta Ret PIS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%COF%' THEN T2."WTAmnt" END) AS "Vlr Ret COFINS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%COF%' THEN T3."Account" END) AS "Conta Ret COFINS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%CSLL%' THEN T2."WTAmnt" END) AS "Vlr Ret CSLL",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%CSLL%' THEN T3."Account" END) AS "Conta Ret CSLL"
    FROM PCH5 T2
    LEFT JOIN OWHT T3 ON T2."WTCode" = T3."WTCode"
    LEFT JOIN OPCH T0 ON T2."AbsEntry" = T0."DocEntry"
    GROUP BY T0."DocEntry"
),

-- ==============================================================================
-- 4. CTE BASE DE DADOS: NOTAS DE SAÍDA
-- ==============================================================================
CTE_BASE_SAIDAS AS (
    SELECT 
        'Saída' AS "Tipo Documento",
        T0."DocEntry",
        T0."DocNum" AS "Nº Documento",
        T0."DocDate" AS "Data Lançamento",
        T0."CardCode" AS "Cód. PN",
        T0."CardName" AS "Nome PN",
        T1."LineNum" + 1 AS "Linha",
        T1."ItemCode" AS "Cód. Item",
        T1."Dscription" AS "Descrição Item",
        T1."Quantity" AS "Quantidade",
        T1."LineTotal" AS "Total Linha",
        T1."TaxCode" AS "Cód. Imposto"
    FROM OINV T0
    INNER JOIN INV1 T1 ON T0."DocEntry" = T1."DocEntry"
    WHERE T0."CANCELED" = 'N'
      -- Filtro de Data do SAP B1
      AND T0."DocDate" >= '[%0]' 
      AND T0."DocDate" <= '[%1]'
),
-- ==============================================================================
-- 5. CTE IMPOSTOS REGULARES PIVOTADOS: SAÍDA
-- ==============================================================================
CTE_IMPOSTOS_SAIDA AS (
    SELECT 
        T1."DocEntry",
        T1."LineNum",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ICMS%' THEN T2."TaxSum" END) AS "Vlr ICMS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ICMS%' THEN T3."SalesTax" END) AS "Conta ICMS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%IPI%' THEN T2."TaxSum" END) AS "Vlr IPI",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%IPI%' THEN T3."SalesTax" END) AS "Conta IPI",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%PIS%' THEN T2."TaxSum" END) AS "Vlr PIS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%PIS%' THEN T3."SalesTax" END) AS "Conta PIS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%COF%' THEN T2."TaxSum" END) AS "Vlr COFINS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%COF%' THEN T3."SalesTax" END) AS "Conta COFINS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ISS%' THEN T2."TaxSum" END) AS "Vlr ISS",
        MAX(CASE WHEN UPPER(T3."Name") LIKE '%ISS%' THEN T3."SalesTax" END) AS "Conta ISS"
    FROM INV1 T1
    INNER JOIN INV4 T2 ON T1."DocEntry" = T2."DocEntry" AND T1."LineNum" = T2."LineNum"
    LEFT JOIN STC1 T5 ON T1."TaxCode" = T5."STCCode" AND T2."staType" = T5."STAType"
    LEFT JOIN OSTA T3 ON T5."STACode" = T3."Code"
    GROUP BY T1."DocEntry", T1."LineNum"
),
-- ==============================================================================
-- 6. CTE RETENÇÕES PIVOTADAS: SAÍDA (Nível Cabeçalho)
-- ==============================================================================
CTE_RETENCOES_SAIDA AS (
    SELECT 
        T0."DocEntry",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%IRRF%' OR UPPER(T3."WTName") LIKE '%IR %' THEN T2."WTAmnt" END) AS "Vlr Ret IRRF",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%IRRF%' OR UPPER(T3."WTName") LIKE '%IR %' THEN T3."Account" END) AS "Conta Ret IRRF",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%INSS%' THEN T2."WTAmnt" END) AS "Vlr Ret INSS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%INSS%' THEN T3."Account" END) AS "Conta Ret INSS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%ISS%' THEN T2."WTAmnt" END) AS "Vlr Ret ISS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%ISS%' THEN T3."Account" END) AS "Conta Ret ISS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%PIS%' THEN T2."WTAmnt" END) AS "Vlr Ret PIS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%PIS%' THEN T3."Account" END) AS "Conta Ret PIS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%COF%' THEN T2."WTAmnt" END) AS "Vlr Ret COFINS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%COF%' THEN T3."Account" END) AS "Conta Ret COFINS",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%CSLL%' THEN T2."WTAmnt" END) AS "Vlr Ret CSLL",
        MAX(CASE WHEN UPPER(T3."WTName") LIKE '%CSLL%' THEN T3."Account" END) AS "Conta Ret CSLL"
    FROM INV5 T2
    LEFT JOIN OWHT T3 ON T2."WTCode" = T3."WTCode"
    LEFT JOIN OINV T0 ON T2."AbsEntry" = T0."DocEntry"
    GROUP BY T0."DocEntry"
)

-- ==============================================================================
-- 7. JOIN FINAL UNINDO ENTRADAS E SAÍDAS
-- ==============================================================================
SELECT 
    B."Tipo Documento", 
    B."Nº Documento", 
    B."Data Lançamento", 
    B."Cód. PN", 
    B."Nome PN", 
    B."Linha", 
    B."Cód. Item", 
    B."Descrição Item", 
    B."Quantidade", 
    B."Total Linha", 
    B."Cód. Imposto",
    
    -- Colunas Impostos Padrões
    I."Vlr ICMS", I."Conta ICMS", 
    I."Vlr IPI", I."Conta IPI", 
    I."Vlr PIS", I."Conta PIS", 
    I."Vlr COFINS", I."Conta COFINS", 
    I."Vlr ISS", I."Conta ISS",
    
    -- Colunas Retenções (Atenção: como retenções no B1 são do documento, esses valores são do documento inteiro e irão repetir nas linhas da mesma nota)
    R."Vlr Ret IRRF", R."Conta Ret IRRF", 
    R."Vlr Ret INSS", R."Conta Ret INSS", 
    R."Vlr Ret ISS", R."Conta Ret ISS", 
    R."Vlr Ret PIS", R."Conta Ret PIS", 
    R."Vlr Ret COFINS", R."Conta Ret COFINS", 
    R."Vlr Ret CSLL", R."Conta Ret CSLL"
    
FROM CTE_BASE_ENTRADAS B
LEFT JOIN CTE_IMPOSTOS_ENTRADA I ON B."DocEntry" = I."DocEntry" AND (B."Linha" - 1) = I."LineNum"
LEFT JOIN CTE_RETENCOES_ENTRADA R ON B."DocEntry" = R."DocEntry"

UNION ALL

SELECT 
    B."Tipo Documento", 
    B."Nº Documento", 
    B."Data Lançamento", 
    B."Cód. PN", 
    B."Nome PN", 
    B."Linha", 
    B."Cód. Item", 
    B."Descrição Item", 
    B."Quantidade", 
    B."Total Linha", 
    B."Cód. Imposto",
    
    I."Vlr ICMS", I."Conta ICMS", 
    I."Vlr IPI", I."Conta IPI", 
    I."Vlr PIS", I."Conta PIS", 
    I."Vlr COFINS", I."Conta COFINS", 
    I."Vlr ISS", I."Conta ISS",
    
    R."Vlr Ret IRRF", R."Conta Ret IRRF", 
    R."Vlr Ret INSS", R."Conta Ret INSS", 
    R."Vlr Ret ISS", R."Conta Ret ISS", 
    R."Vlr Ret PIS", R."Conta Ret PIS", 
    R."Vlr Ret COFINS", R."Conta Ret COFINS", 
    R."Vlr Ret CSLL", R."Conta Ret CSLL"
    
FROM CTE_BASE_SAIDAS B
LEFT JOIN CTE_IMPOSTOS_SAIDA I ON B."DocEntry" = I."DocEntry" AND (B."Linha" - 1) = I."LineNum"
LEFT JOIN CTE_RETENCOES_SAIDA R ON B."DocEntry" = R."DocEntry";
