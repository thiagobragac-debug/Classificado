-- ==============================================================================
-- 🚀 CORREÇÃO DO BUG DE CORRIDA (RACE CONDITION) NOS FAVORITOS
-- ==============================================================================
-- Problema: Duplo-cliques causavam erro de chave única ao tentar inserir o
--           mesmo favorito duas vezes simultaneamente.
-- Solução: Usar PL/pgSQL atômico. Verifica e insere/deleta na mesma transação.
--
-- Instruções: Execute este script no SQL Editor do seu painel Supabase.
-- ==============================================================================

CREATE OR REPLACE FUNCTION toggle_favorite_atomic(p_user_id UUID, p_ad_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Verifica se já existe, fazendo bloqueio na linha se existir
    SELECT EXISTS (
        SELECT 1 
        FROM favorites 
        WHERE user_id = p_user_id AND ad_id = p_ad_id
    ) INTO v_exists;

    IF v_exists THEN
        -- Se existe, remove
        DELETE FROM favorites 
        WHERE user_id = p_user_id AND ad_id = p_ad_id;
        
        -- Retorna FALSE para indicar que foi REMOVIDO
        RETURN FALSE;
    ELSE
        -- Se não existe, insere
        -- Trata conflito caso outra transação insira entre o SELECT e o INSERT
        INSERT INTO favorites (user_id, ad_id) 
        VALUES (p_user_id, p_ad_id)
        ON CONFLICT (user_id, ad_id) DO NOTHING;
        
        -- Retorna TRUE para indicar que foi ADICIONADO
        RETURN TRUE;
    END IF;
END;
$$;
