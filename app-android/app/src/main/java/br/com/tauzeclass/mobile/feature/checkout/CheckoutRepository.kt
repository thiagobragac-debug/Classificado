package br.com.tauzeclass.mobile.feature.checkout

import android.content.Context
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

// BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): sem encodeDefaults=true, o
// kotlinx.serialization OMITE do JSON qualquer campo cujo valor em runtime
// seja igual ao default declarado na data class — inclusive PagarmeTokenRequest.type
// ("card"), que nunca é sobrescrito, então sempre bate com o default e
// sempre sumia do corpo enviado pra Pagar.me. Resultado: toda tokenização
// de cartão (único gateway suportado no app) falhava por campo obrigatório
// ausente, quebrando 100% dos pagamentos. O site já inclui "type" explícito
// (CheckoutModal.tsx), então nunca teve esse problema.
private val lenientJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

class CheckoutException(message: String) : Exception(message)

/**
 * Chama as mesmas rotas Bearer-autenticadas que o site usa
 * (nextjs-app/app/api/checkout/), nunca RPC/Postgrest direto — a lógica de
 * gateway/moeda/cupom/idempotência mora inteira no servidor, de propósito
 * (é dinheiro real). Este repositório NUNCA deve ser chamado com dado de
 * cartão fake/teste contra produção — só com consentimento explícito do
 * usuário completando uma compra de verdade.
 */
@Singleton
class CheckoutRepository @Inject constructor(
    private val httpClient: HttpClient,
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) {
    private fun token() = supabase.auth.currentAccessTokenOrNull()
        ?: throw CheckoutException(appContext.getString(R.string.common_session_expired))

    suspend fun init(planId: String, billingCycle: String): CheckoutInitResponse {
        val body = lenientJson.encodeToString(CheckoutInitRequest.serializer(), CheckoutInitRequest(planId, billingCycle))
        val response = httpClient.post("https://www.tauzeclass.com.br/api/checkout/init") {
            header("Authorization", "Bearer ${token()}")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val parsed = lenientJson.decodeFromString(CheckoutInitResponse.serializer(), response.bodyAsText())
        if (parsed.gateway == null) throw CheckoutException(parsed.error ?: appContext.getString(R.string.checkout_err_init))
        return parsed
    }

    /** Tokenização client-side com chave pública — nenhum dado de cartão passa pelo nosso servidor. */
    suspend fun tokenizePagarme(publicKey: String, holderName: String, number: String, expMonth: Int, expYear: Int, cvv: String): String {
        val body = lenientJson.encodeToString(
            PagarmeTokenRequest.serializer(),
            PagarmeTokenRequest(card = PagarmeCard(number, holderName, expMonth, expYear, cvv))
        )
        val response = httpClient.post("https://api.pagar.me/core/v5/tokens?appId=$publicKey") {
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val parsed = lenientJson.decodeFromString(PagarmeTokenResponse.serializer(), response.bodyAsText())
        return parsed.id ?: throw CheckoutException(parsed.message ?: appContext.getString(R.string.checkout_err_card_validate))
    }

    suspend fun checkout(request: CheckoutRequest): CheckoutResponse {
        val body = lenientJson.encodeToString(CheckoutRequest.serializer(), request)
        val response = httpClient.post("https://www.tauzeclass.com.br/api/checkout") {
            header("Authorization", "Bearer ${token()}")
            contentType(ContentType.Application.Json)
            setBody(body)
        }
        val parsed = lenientJson.decodeFromString(CheckoutResponse.serializer(), response.bodyAsText())
        if (!parsed.success) throw CheckoutException(parsed.error ?: appContext.getString(R.string.checkout_err_subscription))
        return parsed
    }
}
