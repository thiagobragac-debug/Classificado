package br.com.tauzeclass.mobile.feature.ads

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

// Mesmas colunas que app/(public)/layout do site pede via .select() encadeado
// na RPC (confirmado ao vivo no endpoint REST real, não só lendo o código do
// site) — inclui o embed profiles(name, avatar_url, verified) pro card exibir
// nome/selo do vendedor sem uma segunda chamada.
private const val AD_CARD_COLUMNS =
    "id, slug, title_pt, title_es, price, currency, price_unit_pt, negotiable, featured, images, category_id, subcategory_id, city, state, country, views_count, created_at, profiles(id, slug, name, avatar_url, verified)"

/**
 * Geo-personalização (IP/GPS) ainda não implementada nesta fase — os três
 * parâmetros de localização das RPCs sempre vão null, que é exatamente o
 * comportamento "sem personalização" das mesmas RPCs no site.
 */
private fun geoParams(limit: Int, offset: Int? = null): JsonObject = buildJsonObject {
    put("p_city", null as String?)
    put("p_state", null as String?)
    put("p_country", null as String?)
    put("p_limit", limit)
    if (offset != null) put("p_offset", offset)
}

@Singleton
class AdsRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    suspend fun getFeaturedAds(limit: Int = 8): List<Ad> =
        supabase.postgrest.rpc("get_localized_featured_ads", geoParams(limit)) {
            select(Columns.raw(AD_CARD_COLUMNS))
        }.decodeList()

    suspend fun getRecentAds(limit: Int = 10, offset: Int = 0): List<Ad> =
        supabase.postgrest.rpc("get_localized_recent_ads", geoParams(limit, offset)) {
            select(Columns.raw(AD_CARD_COLUMNS))
        }.decodeList()

    suspend fun getAdBySlug(slug: String): AdDetail? =
        supabase.postgrest.from("ads").select(Columns.raw(AD_DETAIL_COLUMNS)) {
            filter {
                eq("slug", slug)
                eq("status", "active")
            }
        }.decodeSingleOrNull()

    /** Espelha increment_ad_view_safe já usado pelo site — não falhar a tela por causa disso. */
    suspend fun incrementAdView(adId: String) {
        supabase.postgrest.rpc("increment_ad_view_safe", buildJsonObject { put("p_ad_id", adId) })
    }

    /**
     * toggle_favorite_atomic retorna um boolean cru (não uma lista) — a
     * função SQL tem "returns boolean", e o Postgrest devolve o valor
     * escalar direto no corpo, sem embrulhar em array (confirmado no
     * PostgrestResultTest.kt oficial: decodeAs<T>() é pra isso,
     * decodeList<T>() quebraria tentando ler um escalar como array).
     * Retorna true = agora está favoritado, false = removido dos favoritos.
     */
    suspend fun toggleFavorite(adId: String): Boolean =
        supabase.postgrest.rpc("toggle_favorite_atomic", buildJsonObject { put("p_ad_id", adId) })
            .decodeAs()

    /** RLS de favorites é self-only (auth.uid() = user_id) — não precisa filtrar por usuário aqui. */
    suspend fun getFavoriteAdIds(): Set<String> =
        supabase.postgrest.from("favorites").select(Columns.raw("ad_id"))
            .decodeList<FavoriteRow>().map { it.adId }.toSet()

    suspend fun getFavoriteAds(): List<Ad> {
        val ids = getFavoriteAdIds()
        if (ids.isEmpty()) return emptyList()
        return supabase.postgrest.from("ads").select(Columns.raw(AD_CARD_COLUMNS)) {
            filter {
                isIn("id", ids.toList())
                eq("status", "active")
            }
        }.decodeList()
    }
}

@kotlinx.serialization.Serializable
private data class FavoriteRow(@kotlinx.serialization.SerialName("ad_id") val adId: String)

private const val AD_DETAIL_COLUMNS =
    "id, slug, title_pt, title_es, description, price, currency, price_unit_pt, negotiable, images, video_url, category_id, subcategory_id, city, state, country, views_count, created_at, condition, purpose, user_id, profiles(id, slug, name, avatar_url, verified)"
