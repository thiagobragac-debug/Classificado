package br.com.tauzeclass.mobile.feature.auth

import android.content.Context
import android.util.Base64
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import br.com.tauzeclass.mobile.R
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import java.security.MessageDigest
import java.security.SecureRandom

// Mesmo Client ID "Web" já usado pelo site (NEXT_PUBLIC_GOOGLE_CLIENT_ID em
// nextjs-app/.env.local) — é isso que o Credential Manager espera em
// setServerClientId, não um client ID "Android" separado (confirmado na doc
// oficial: developer.android.com/identity/sign-in/credential-manager-siwg-implementation).
private const val WEB_CLIENT_ID = "970845845869-q9tj5rq99br6hciv3finm5b98en6i9ie.apps.googleusercontent.com"

data class GoogleSignInResult(val idToken: String, val rawNonce: String)

sealed class GoogleSignInOutcome {
    data class Success(val result: GoogleSignInResult) : GoogleSignInOutcome()
    /** Nenhuma Conta Google disponível no aparelho — cenário real testado neste emulador. */
    data class NoAccountAvailable(val message: String) : GoogleSignInOutcome()
    /**
     * Usuário cancelou de propósito (voltou/fechou o seletor de conta) —
     * testado ao vivo neste emulador (código real: "[16] Cancelled by
     * user"). Não é um erro pra mostrar na tela, só volta pro formulário
     * em silêncio.
     */
    data object Cancelled : GoogleSignInOutcome()
    data class Failure(val message: String) : GoogleSignInOutcome()
}

private fun generateSecureRandomNonce(byteLength: Int = 32): String {
    val randomBytes = ByteArray(byteLength)
    SecureRandom().nextBytes(randomBytes)
    return Base64.encodeToString(randomBytes, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
}

/**
 * BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): o Google recebe (via
 * setNonce) o HASH SHA-256 do nonce, não o nonce cru — é ele que grava esse
 * valor na claim "nonce" do ID token. O Supabase GoTrue, ao validar,
 * recalcula sha256(nonce cru recebido do cliente) e compara contra essa
 * claim. Antes desta correção, o mesmo valor cru era usado nos dois lados
 * (setNonce E o nonce devolvido pro Supabase), então a comparação nunca
 * batia e todo login/cadastro via Google falhava. Mesmo algoritmo já usado
 * e testado em produção pelo site (generateNoncePair() em
 * nextjs-app/lib/google-identity.ts): hex lowercase, não base64.
 */
private fun sha256Hex(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
}

/**
 * Fluxo de botão (GetSignInWithGoogleOption), não o bottom sheet automático
 * (GetGoogleIdOption com filterByAuthorizedAccounts) — espelha o botão
 * explícito "Continuar com Google" que já existe no site.
 */
suspend fun requestGoogleSignIn(context: Context): GoogleSignInOutcome {
    val nonce = generateSecureRandomNonce()
    val hashedNonce = sha256Hex(nonce)
    val option = GetSignInWithGoogleOption.Builder(serverClientId = WEB_CLIENT_ID)
        .setNonce(hashedNonce)
        .build()
    val request = GetCredentialRequest.Builder()
        .addCredentialOption(option)
        .build()
    val credentialManager = CredentialManager.create(context)

    return try {
        val response = credentialManager.getCredential(request = request, context = context)
        val credential = response.credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            val googleIdTokenCredential = GoogleIdTokenCredential.createFrom(credential.data)
            GoogleSignInOutcome.Success(GoogleSignInResult(googleIdTokenCredential.idToken, nonce))
        } else {
            GoogleSignInOutcome.Failure(context.getString(R.string.auth_google_err_credential_type))
        }
    } catch (e: NoCredentialException) {
        GoogleSignInOutcome.NoAccountAvailable(context.getString(R.string.auth_google_err_no_account))
    } catch (e: GetCredentialCancellationException) {
        GoogleSignInOutcome.Cancelled
    } catch (e: GetCredentialException) {
        GoogleSignInOutcome.Failure(e.message ?: context.getString(R.string.auth_google_err_generic))
    } catch (e: GoogleIdTokenParsingException) {
        GoogleSignInOutcome.Failure(context.getString(R.string.auth_google_err_invalid_response))
    }
}
