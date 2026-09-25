package br.com.tauzeclass.mobile.feature.ads

import android.content.Context
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class ContactSellerResponse(val whatsappUrl: String? = null, val error: String? = null)

sealed class ContactSellerOutcome {
    data class Success(val whatsappUrl: String) : ContactSellerOutcome()
    data class Failure(val message: String) : ContactSellerOutcome()
}

private val lenientJson = Json { ignoreUnknownKeys = true }

/**
 * Chama a variante Bearer de app/api/contact-seller (adicionada nesta mesma
 * sessão especificamente para os apps nativos — nextjs-app/app/api/contact-seller/route.ts)
 * em vez da RPC get_seller_phone direto: nunca expor o telefone cru no
 * cliente, é a rota que já resolve isso do lado do servidor.
 */
@Singleton
class ContactSellerService @Inject constructor(
    private val httpClient: HttpClient,
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) {
    suspend fun getWhatsappUrl(adId: String): ContactSellerOutcome {
        val token = supabase.auth.currentAccessTokenOrNull()
            ?: return ContactSellerOutcome.Failure(appContext.getString(R.string.common_session_expired))

        return try {
            val response = httpClient.get("https://www.tauzeclass.com.br/api/contact-seller") {
                url { parameters.append("adId", adId) }
                header("Authorization", "Bearer $token")
            }
            val parsed = lenientJson.decodeFromString<ContactSellerResponse>(response.bodyAsText())
            if (response.status == HttpStatusCode.OK && parsed.whatsappUrl != null) {
                ContactSellerOutcome.Success(parsed.whatsappUrl)
            } else {
                ContactSellerOutcome.Failure(parsed.error ?: appContext.getString(R.string.ads_error_contact_seller))
            }
        } catch (e: Exception) {
            android.util.Log.e("TC_CONTACT_SELLER", "Falha ao chamar contact-seller", e)
            ContactSellerOutcome.Failure(appContext.getString(R.string.common_error_connection))
        }
    }
}
