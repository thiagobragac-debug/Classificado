package br.com.tauzeclass.mobile.feature.auth

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.providers.builtin.IDToken
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Espelha lib/supabase.ts do site: mesmo backend (Supabase Auth), mesmas
 * regras — só a forma de obter o ID token do Google muda (Credential
 * Manager nativo em vez de Google Identity Services do browser).
 */
@Singleton
class AuthRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    val sessionStatus: StateFlow<SessionStatus> get() = supabase.auth.sessionStatus

    suspend fun signInWithEmail(email: String, password: String) {
        supabase.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): sem enviar "name" como
    // metadata, handle_new_user() cria o perfil sem nome — igual ao site
    // (nextjs-app/lib/supabase.ts, signupWithEmail(email, password, name)
    // -> options: { data: { name } }), campo lido por vários lugares do app
    // (nome do vendedor no anúncio, "outro nome" do chat etc., com fallback
    // pra "Vendedor(a) Anônimo(a)" quando ausente).
    suspend fun signUpWithEmail(email: String, password: String, name: String) {
        supabase.auth.signUpWith(Email) {
            this.email = email
            this.password = password
            this.data = buildJsonObject { put("name", name) }
        }
    }

    suspend fun signInWithGoogleIdToken(idToken: String, rawNonce: String) {
        supabase.auth.signInWith(IDToken) {
            this.idToken = idToken
            this.provider = Google
            this.nonce = rawNonce
        }
    }

    suspend fun signOut() {
        supabase.auth.signOut()
    }

    /**
     * profiles.email_verified é uma coluna morta (nenhum UPDATE/trigger do
     * backend a escreve — confirmado na auditoria ao vivo de 2026-09-25,
     * mesmo bug que o site já corrigiu em painel/page.tsx). A fonte real é
     * o Supabase Auth: email_confirmed_at do usuário logado, não nulo assim
     * que o link de confirmação é clicado.
     */
    fun isEmailConfirmed(): Boolean = supabase.auth.currentUserOrNull()?.emailConfirmedAt != null
}
