package br.com.tauzeclass.mobile.feature.myads

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * ads filtrado por user_id (sem filtro de status — inclui draft/pending/
 * paused/expired/deleted, diferente da listagem pública que só mostra
 * status='active'). Mesmas colunas de getMyAds() do site + slug (adicionado
 * de propósito pra reusar AdCard/navegação, custo zero já que ads sempre
 * tem slug gerado no insert).
 */
@Serializable
data class MyAd(
    val id: String,
    val slug: String,
    @SerialName("title_pt") val titlePt: String,
    @SerialName("title_es") val titleEs: String? = null,
    val price: Double? = null,
    val currency: String,
    val status: String,
    val featured: Boolean = false,
    val images: List<String> = emptyList(),
    @SerialName("category_id") val categoryId: String,
    val city: String? = null,
    val state: String? = null,
    val country: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    @SerialName("views_count") val viewsCount: Int = 0,
    @SerialName("expires_at") val expiresAt: String? = null,
) {
    /** Converte pro modelo que AdCard já sabe desenhar — reaproveita o componente existente em vez de recriar. */
    fun toAdCardModel() = br.com.tauzeclass.mobile.feature.ads.Ad(
        id = id, slug = slug, titlePt = titlePt, titleEs = titleEs, price = price, currency = currency,
        priceUnitPt = null, negotiable = false, featured = featured, images = images,
        categoryId = categoryId, subcategoryId = null, city = city, state = state, country = country,
        viewsCount = viewsCount, createdAt = createdAt, profiles = null
    )
}

// Rótulos (label do filtro, status badge) NÃO ficam aqui: enum/const não tem acesso a Context
// pra chamar stringResource()/getString(). A tradução é resolvida por um `when` no ponto de uso
// em MyAdsScreen.kt (funções @Composable filterLabel()/statusLabel() ali), mantendo este arquivo
// livre de dependência do Compose.
enum class AdStatusFilter(val dbValue: String?) {
    ALL(null),
    ACTIVE("active"),
    PENDING("pending"),
    PAUSED("paused"),
    EXPIRED("expired"),
}
