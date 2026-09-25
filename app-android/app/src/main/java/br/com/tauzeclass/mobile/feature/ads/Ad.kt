package br.com.tauzeclass.mobile.feature.ads

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Espelha as colunas reais retornadas pelas RPCs get_localized_featured_ads /
 * get_localized_recent_ads (mesmas usadas pelo site,
 * nextjs-app/lib/supabase-server.ts) + embed de profiles(name, avatar_url,
 * verified) — confirmado ao vivo chamando o endpoint REST real do Postgrest,
 * não suposto a partir do código do site.
 */
@Serializable
data class Ad(
    val id: String,
    val slug: String,
    @SerialName("title_pt") val titlePt: String,
    @SerialName("title_es") val titleEs: String? = null,
    // Nullable — achado ao vivo testando com dado real de produção: existem
    // linhas ativas com price NULL no banco (dado de teste antigo), a
    // deserialização quebrava com Double não-nulo.
    val price: Double? = null,
    val currency: String,
    @SerialName("price_unit_pt") val priceUnitPt: String? = null,
    val negotiable: Boolean = false,
    val featured: Boolean = false,
    val images: List<String> = emptyList(),
    @SerialName("category_id") val categoryId: String,
    @SerialName("subcategory_id") val subcategoryId: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    @SerialName("views_count") val viewsCount: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
    val profiles: SellerSummary? = null
) {
    /** Mesma regra do site: título em espanhol só existe se preenchido, senão cai pro português. */
    fun displayTitle(spanish: Boolean): String = if (spanish) titleEs ?: titlePt else titlePt

    val coverImageUrl: String? get() = images.firstOrNull()
}

@Serializable
data class SellerSummary(
    val id: String? = null,
    val slug: String? = null,
    val name: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val verified: Boolean = false
) {
    /** Rota preferida pro perfil do vendedor: slug se existir, senão o id cru. */
    val slugOrId: String? get() = slug ?: id
}

/**
 * Colunas completas da tabela ads (não só o subconjunto das RPCs de
 * listagem) — confirmado ao vivo contra o endpoint REST real do Postgrest
 * filtrando por slug, mesma tabela/RLS que a Home já usa via RPC.
 */
@Serializable
data class AdDetail(
    val id: String,
    val slug: String,
    @SerialName("title_pt") val titlePt: String,
    @SerialName("title_es") val titleEs: String? = null,
    val description: String? = null,
    val price: Double? = null,
    val currency: String,
    @SerialName("price_unit_pt") val priceUnitPt: String? = null,
    val negotiable: Boolean = false,
    val images: List<String> = emptyList(),
    @SerialName("video_url") val videoUrl: String? = null,
    @SerialName("category_id") val categoryId: String,
    @SerialName("subcategory_id") val subcategoryId: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    @SerialName("views_count") val viewsCount: Int = 0,
    @SerialName("created_at") val createdAt: String? = null,
    val condition: String? = null,
    val purpose: String? = null,
    @SerialName("user_id") val userId: String,
    val profiles: SellerSummary? = null
) {
    fun displayTitle(spanish: Boolean): String = if (spanish) titleEs ?: titlePt else titlePt
}
