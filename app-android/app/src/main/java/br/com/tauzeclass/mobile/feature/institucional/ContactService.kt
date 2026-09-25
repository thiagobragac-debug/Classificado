package br.com.tauzeclass.mobile.feature.institucional

import android.content.Context
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.qualifiers.ApplicationContext
import io.ktor.client.HttpClient
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
data class ContactRequest(
    val name: String,
    val email: String,
    val phone: String? = null,
    val subject: String,
    val message: String,
    val lang: String = "pt"
)

sealed class ContactOutcome {
    data object Success : ContactOutcome()
    data class Failure(val message: String) : ContactOutcome()
}

@Serializable
private data class ContactErrorResponse(val error: String? = null)

private val lenientJson = Json { ignoreUnknownKeys = true }

/**
 * POST /api/contact — grava em contact_messages (fila de moderação do
 * admin), não envia e-mail. Não exige autenticação. Diferente de
 * contact-seller, não precisa de Bearer token.
 */
@Singleton
class ContactService @Inject constructor(
    private val httpClient: HttpClient,
    @ApplicationContext private val appContext: Context
) {
    suspend fun send(request: ContactRequest): ContactOutcome = try {
        val response = httpClient.post("https://www.tauzeclass.com.br/api/contact") {
            contentType(ContentType.Application.Json)
            setBody(Json.encodeToString(ContactRequest.serializer(), request))
        }
        when (response.status) {
            HttpStatusCode.OK -> ContactOutcome.Success
            HttpStatusCode.TooManyRequests -> ContactOutcome.Failure(appContext.getString(R.string.institucional_err_rate_limit))
            else -> {
                val parsed = runCatching { lenientJson.decodeFromString<ContactErrorResponse>(response.bodyAsText()) }.getOrNull()
                ContactOutcome.Failure(parsed?.error ?: appContext.getString(R.string.institucional_err_send))
            }
        }
    } catch (e: Exception) {
        ContactOutcome.Failure(appContext.getString(R.string.common_error_connection))
    }
}
