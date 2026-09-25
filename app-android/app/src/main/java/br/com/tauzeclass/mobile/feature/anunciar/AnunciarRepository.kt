package br.com.tauzeclass.mobile.feature.anunciar

import android.content.Context
import android.net.Uri
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.media.AdImageProcessor
import br.com.tauzeclass.mobile.feature.media.StorageUploader
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.storage.storage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

private const val AD_EDIT_COLUMNS =
    "id, title_pt, description, category_id, subcategory_id, purpose, price, currency, price_unit_pt, negotiable, country, state, city, condition, images, video_url, status"

/** Campos editáveis do anúncio — sem user_id de propósito (nunca sobrescrever esse campo num update; a query já filtra por ele no WHERE). */
@Serializable
data class AdUpdatePayload(
    @SerialName("title_pt") val titlePt: String,
    val description: String,
    @SerialName("category_id") val categoryId: String,
    @SerialName("subcategory_id") val subcategoryId: String? = null,
    val purpose: String? = null,
    val price: Double? = null,
    val currency: String,
    @SerialName("price_unit_pt") val priceUnitPt: String? = null,
    val country: String,
    val state: String,
    val city: String,
    val negotiable: Boolean = false,
    val condition: String? = null,
    val status: String,
    val images: List<String> = emptyList(),
    @SerialName("video_url") val videoUrl: String? = null,
)

@Serializable
private data class AdInsertPayload(
    @SerialName("user_id") val userId: String,
    @SerialName("title_pt") val titlePt: String,
    val description: String,
    @SerialName("category_id") val categoryId: String,
    @SerialName("subcategory_id") val subcategoryId: String? = null,
    val purpose: String? = null,
    val price: Double? = null,
    val currency: String,
    @SerialName("price_unit_pt") val priceUnitPt: String? = null,
    val country: String,
    val state: String,
    val city: String,
    val negotiable: Boolean = false,
    val condition: String? = null,
    val status: String,
    val images: List<String> = emptyList(),
    @SerialName("video_url") val videoUrl: String? = null,
)

@Serializable
data class AdEditData(
    val id: String,
    @SerialName("title_pt") val titlePt: String,
    val description: String? = null,
    @SerialName("category_id") val categoryId: String,
    @SerialName("subcategory_id") val subcategoryId: String? = null,
    val purpose: String? = null,
    val price: Double? = null,
    val currency: String,
    @SerialName("price_unit_pt") val priceUnitPt: String? = null,
    val negotiable: Boolean = false,
    val country: String? = null,
    val state: String? = null,
    val city: String? = null,
    val condition: String? = null,
    val images: List<String> = emptyList(),
    @SerialName("video_url") val videoUrl: String? = null,
    val status: String,
) {
    fun toFormValues() = AnuncioFormValues(
        titulo = titlePt, categoria = categoryId, subcategoria = subcategoryId, finalidade = purpose,
        descricao = description.orEmpty(), moeda = currency,
        preco = price?.let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString().replace(".", ",") }.orEmpty(),
        aNegociar = negotiable, unidadePreco = priceUnitPt, condicao = condition,
        pais = country ?: "Brasil", estado = state, cidade = city.orEmpty(), fotos = images, video = videoUrl,
    )
}

@Serializable private data class AdIdRow(val id: String)

@Singleton
class AnunciarRepository @Inject constructor(
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) {
    private fun uid() = supabase.auth.currentUserOrNull()?.id ?: error(appContext.getString(R.string.common_session_not_found))

    suspend fun getAdForEdit(id: String): AdEditData? {
        val uid = uid()
        return supabase.postgrest.from("ads").select(Columns.raw(AD_EDIT_COLUMNS)) {
            filter { eq("id", id); eq("user_id", uid) } // IDOR-safe, mesmo padrão do page.tsx do site
        }.decodeSingleOrNull()
    }

    suspend fun getLatestDraft(): AdEditData? {
        val uid = uid()
        return supabase.postgrest.from("ads").select(Columns.raw(AD_EDIT_COLUMNS)) {
            filter { eq("user_id", uid); eq("status", "draft") }
            order("created_at", Order.DESCENDING)
            limit(1)
        }.decodeList<AdEditData>().firstOrNull()
    }

    suspend fun createAd(payload: AdUpdatePayload): String {
        val uid = uid()
        val insertPayload = AdInsertPayload(
            userId = uid, titlePt = payload.titlePt, description = payload.description,
            categoryId = payload.categoryId, subcategoryId = payload.subcategoryId, purpose = payload.purpose,
            price = payload.price, currency = payload.currency, priceUnitPt = payload.priceUnitPt,
            country = payload.country, state = payload.state, city = payload.city,
            negotiable = payload.negotiable, condition = payload.condition, status = payload.status,
            images = payload.images, videoUrl = payload.videoUrl,
        )
        val row = supabase.postgrest.from("ads").insert(insertPayload) { select(Columns.raw("id")) }.decodeSingle<AdIdRow>()
        return row.id
    }

    suspend fun updateAd(id: String, payload: AdUpdatePayload) {
        val uid = uid()
        supabase.postgrest.from("ads").update(payload) {
            filter { eq("id", id); eq("user_id", uid) }
        }
    }

    /** Compressão + watermark + upload — RLS de ad-images exige uid como PRIMEIRO segmento do path. */
    suspend fun uploadPhoto(context: Context, uri: Uri): String {
        val uid = uid()
        val bytes = AdImageProcessor.process(context, uri)
        val path = "$uid/draft/${System.currentTimeMillis()}_${(1000..9999).random()}.jpg" // processor sempre grava JPEG
        val bucket = supabase.storage.from("ad-images")
        bucket.upload(path, bytes)
        return bucket.publicUrl(path)
    }

    /** Ordem INVERTIDA em relação ao bucket de fotos — bucket ad-videos exige folder primeiro, uid depois. */
    suspend fun uploadVideo(context: Context, uri: Uri): String {
        val uid = uid()
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error(context.getString(R.string.anunciar_err_read_video))
        val ext = StorageUploader.safeVideoExt(context, uri)
        val path = "draft/$uid/${System.currentTimeMillis()}_${(1000..9999).random()}.$ext"
        val bucket = supabase.storage.from("ad-videos")
        bucket.upload(path, bytes)
        return bucket.publicUrl(path)
    }
}
