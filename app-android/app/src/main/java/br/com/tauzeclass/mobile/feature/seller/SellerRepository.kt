package br.com.tauzeclass.mobile.feature.seller

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

private const val PROFILE_COLUMNS = "id, slug, name, display_name, created_at, verified, avatar_url, banner_url"
private val UUID_REGEX = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

@Singleton
class SellerRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    /** Tenta por slug, senão (só se parecer UUID) por id — mesma lógica de resolveProfileBySlug do site. */
    suspend fun resolveProfile(slugOrId: String): SellerProfile? {
        val bySlug = supabase.postgrest.from("profiles").select(Columns.raw(PROFILE_COLUMNS)) {
            filter { eq("slug", slugOrId) }
        }.decodeSingleOrNull<SellerProfile>()
        if (bySlug != null) return bySlug
        if (!UUID_REGEX.matches(slugOrId)) return null
        return supabase.postgrest.from("profiles").select(Columns.raw(PROFILE_COLUMNS)) {
            filter { eq("id", slugOrId) }
        }.decodeSingleOrNull()
    }

    suspend fun getSellerStats(sellerId: String): SellerStats =
        supabase.postgrest.rpc("get_seller_stats", buildJsonObject { put("p_seller_id", sellerId) })
            .decodeList<SellerStats>().firstOrNull() ?: SellerStats()

    /**
     * INSERT direto (não há RPC de escrita) — RLS + as constraints do banco
     * (não pode se autoavaliar; par vendedor/avaliador é único) fazem a
     * validação real; a checagem local é só UX, não é a defesa.
     */
    suspend fun submitReview(sellerId: String, reviewerId: String, rating: Int, comment: String?) {
        supabase.postgrest.from("seller_reviews").insert(
            SellerReviewInsert(sellerId = sellerId, reviewerId = reviewerId, rating = rating, comment = comment?.trim()?.take(500)?.ifBlank { null })
        )
    }
}
