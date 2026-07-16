SELECT DISTINCT
    T0."DocNum" AS "Nº Entrega (SAP)",
    T0."DocDate" AS "Data da Entrega",
    T2."DocNum" AS "Nº Fatura (SAP)",
    T2."Serial" AS "Nº Nota Fiscal (Saída)",
    T2."DocDate" AS "Data da Nota Fiscal",
    T2."DocTotal" AS "Valor Total NF",
    T2."PaidToDate" AS "Valor Pago",
    (T2."DocTotal" - T2."PaidToDate") AS "Valor em Aberto",
    CASE 
        WHEN T2."DocStatus" = 'C' OR (T2."DocTotal" - T2."PaidToDate") = 0 THEN 'Sim'
        ELSE 'Não' 
    END AS "Está Pago?"
FROM ODLN T0
INNER JOIN INV1 T1 ON T1."BaseEntry" = T0."DocEntry" AND T1."BaseType" = 15
INNER JOIN OINV T2 ON T1."DocEntry" = T2."DocEntry"
ORDER BY 
    T0."DocDate" DESC;
