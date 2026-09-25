package br.com.tauzeclass.mobile.feature.seller

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** profiles(id, slug, name, display_name, created_at, verified, avatar_url, banner_url) — confirmado ao vivo via curl real. */
@Serializable
data class SellerProfile(
    val id: String,
    val slug: String? = null,
    val name: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val verified: Boolean = false,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null
) {
    /**
     * Mesma regra de fallback do site: display_name || name || "Vendedor(a) Anônimo(a)".
     * O texto do fallback fica de fora de propósito: este data class não tem Context/recursos
     * (não é @Composable), então quem resolve o texto é o call site em VendedorScreen.kt,
     * via stringResource(R.string.seller_anonymous).
     */
    val displayNameOrNull: String? get() = displayName?.takeIf { it.isNotBlank() }
        ?: name?.takeIf { it.isNotBlank() }
}

/** Retorno de get_seller_stats(p_seller_id) — confirmado ao vivo via curl real. */
@Serializable
data class SellerStats(
    @SerialName("total_reviews") val totalReviews: Long = 0,
    @SerialName("avg_rating") val avgRating: Double = 0.0
)

@Serializable
internal data class SellerReviewInsert(
    @SerialName("seller_id") val sellerId: String,
    @SerialName("reviewer_id") val reviewerId: String,
    val rating: Int,
    val comment: String?
)
