package br.com.tauzeclass.mobile.feature.plans

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Serializable
private data class GeoipResponse(val countryCode: String? = null)

private val lenientGeoJson = Json { ignoreUnknownKeys = true }

private const val PLAN_COLUMNS =
    "id, name, name_es, description, description_es, price, promotional_price, price_usd, promotional_price_usd, currency, icon, max_ads, max_photos, highlight_count, has_video, has_banner, features, sort_order"

/** Limites do plano do usuário logado — usado pelo Perfil (gate de banner) e pelo Anunciar (fotos/vídeo). */
@Serializable
data class MyPlanLimits(
    @SerialName("max_photos") val maxPhotos: Int = 5, // default do plano Grátis, mesmo fallback do site pra usuário sem sessão
    @SerialName("has_video") val hasVideo: Boolean = false,
    @SerialName("has_banner") val hasBanner: Boolean = false,
)

@Serializable
private data class PlanIdRow(@SerialName("plan_id") val planId: String?)

@Singleton
class PlansRepository @Inject constructor(
    private val supabase: SupabaseClient,
    private val httpClient: HttpClient,
) {
    /**
     * BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): price_usd/promotional_price_usd
     * já eram buscados mas nunca usados — tela de Planos sempre mostrava BRL,
     * mesmo pra visitante fora do Brasil. Mesma regra do site
     * (PricingClientUI.tsx): geoip client-side, default BRL em qualquer
     * falha/timeout (visitante brasileiro, a maioria, nunca vê flash de preço).
     */
    suspend fun shouldUseUsd(lang: String): Boolean = runCatching {
        val response = httpClient.get("https://www.tauzeclass.com.br/api/geoip?lang=$lang")
        val parsed = lenientGeoJson.decodeFromString(GeoipResponse.serializer(), response.bodyAsText())
        parsed.countryCode != null && parsed.countryCode.uppercase() != "BR"
    }.getOrDefault(false)

    suspend fun getMyPlanLimits(): MyPlanLimits {
        val uid = supabase.auth.currentUserOrNull()?.id ?: return MyPlanLimits()
        // user_secrets usa "id" como chave (igual a profiles.id/auth.users.id), NÃO "user_id" —
        // achado ao vivo via curl real (PGRST42703 "column user_secrets.user_id does not exist").
        val planId = supabase.postgrest.from("user_secrets").select(Columns.raw("plan_id")) {
            filter { eq("id", uid) }
        }.decodeSingleOrNull<PlanIdRow>()?.planId ?: return MyPlanLimits()
        return supabase.postgrest.from("plans").select(Columns.raw("max_photos, has_video, has_banner")) {
            filter { eq("id", planId) }
        }.decodeSingleOrNull<MyPlanLimits>() ?: MyPlanLimits()
    }

    /** RLS pública (is_active=true), confirmado ao vivo sem sessão — mesma query que /planos usa. */
    suspend fun getActivePlans(): List<Plan> =
        supabase.postgrest.from("plans").select(Columns.raw(PLAN_COLUMNS)) {
            filter { eq("is_active", true) }
            order("sort_order", Order.ASCENDING)
        }.decodeList()

    suspend fun getMyPlanId(): String? {
        val uid = supabase.auth.currentUserOrNull()?.id ?: return null
        return supabase.postgrest.from("user_secrets").select(Columns.raw("plan_id")) {
            filter { eq("id", uid) }
        }.decodeSingleOrNull<PlanIdRow>()?.planId
    }
}
