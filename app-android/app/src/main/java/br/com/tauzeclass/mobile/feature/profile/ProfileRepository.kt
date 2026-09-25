package br.com.tauzeclass.mobile.feature.profile

import android.content.Context
import android.net.Uri
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.media.StorageUploader
import br.com.tauzeclass.mobile.feature.plans.PlansRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.storage.storage
import javax.inject.Inject
import javax.inject.Singleton

private const val PROFILE_COLUMNS =
    "id, name, display_name, avatar_url, banner_url, bio, city, state, country, kyc_status, email_verified, phone_verified"
private const val SECRETS_COLUMNS =
    "plan_id, document_number, zip_code, street, number, complement, neighborhood, phone_whatsapp"

@Singleton
class ProfileRepository @Inject constructor(
    private val supabase: SupabaseClient,
    private val plansRepository: PlansRepository,
    @ApplicationContext private val appContext: Context
) {
    private fun uid() = supabase.auth.currentUserOrNull()?.id ?: error(appContext.getString(R.string.common_session_not_found))

    suspend fun getMyProfile(): MyProfile {
        val id = uid()
        val profile = supabase.postgrest.from("profiles").select(Columns.raw(PROFILE_COLUMNS)) {
            filter { eq("id", id) }
        }.decodeSingle<ProfileRow>()
        // user_secrets usa "id" como chave (igual a profiles.id/auth.users.id), NÃO "user_id" —
        // achado ao vivo via curl real (PGRST42703 "column user_secrets.user_id does not exist").
        val secrets = supabase.postgrest.from("user_secrets").select(Columns.raw(SECRETS_COLUMNS)) {
            filter { eq("id", id) }
        }.decodeSingleOrNull<UserSecretsRow>() ?: UserSecretsRow()
        return MyProfile(profile, secrets)
    }

    /**
     * payload: mapa campo->valor já validado pela UI. Espelha updateProfile()
     * de lib/supabase.ts:772-790. Como o upsert de user_secrets reenvia TODOS
     * os campos secretos de uma vez (upsert substitui a linha inteira), o
     * chamador deve sempre passar o snapshot COMPLETO do formulário (ex.:
     * ProfileFormValues.toPayloadMap()) — um payload parcial apagaria os
     * campos secretos omitidos.
     */
    suspend fun updateProfile(payload: Map<String, String?>) {
        val id = uid()
        val (secretEntries, profileEntries) = payload.entries.partition { it.key in PROFILE_SECRET_KEYS }

        if (profileEntries.isNotEmpty()) {
            supabase.postgrest.from("profiles").update({
                profileEntries.forEach { (k, v) -> if (v == null) setToNull(k) else set(k, v) }
            }) { filter { eq("id", id) } }
        }
        if (secretEntries.isNotEmpty()) {
            val secretsPayload = UserSecretsUpdate(
                id = id,
                documentNumber = secretEntries.find { it.key == "document_number" }?.value,
                zipCode = secretEntries.find { it.key == "zip_code" }?.value,
                street = secretEntries.find { it.key == "street" }?.value,
                number = secretEntries.find { it.key == "number" }?.value,
                complement = secretEntries.find { it.key == "complement" }?.value,
                neighborhood = secretEntries.find { it.key == "neighborhood" }?.value,
                phoneWhatsapp = secretEntries.find { it.key == "phone_whatsapp" }?.value,
            )
            supabase.postgrest.from("user_secrets").upsert(secretsPayload) { onConflict = "id" }
        }
    }

    suspend fun uploadAvatar(context: Context, uri: Uri): String {
        val id = uid()
        val ext = StorageUploader.safeImageExt(context, uri)
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error(context.getString(R.string.common_err_read_file))
        val path = "$id/${System.currentTimeMillis()}.$ext"
        val bucket = supabase.storage.from("avatars") // bucket público, sem gate de plano — confirmado via curl no levantamento
        bucket.upload(path, bytes)
        val publicUrl = bucket.publicUrl(path)
        val previousUrl = runCatching { getMyProfile().profile.avatarUrl }.getOrNull()
        updateProfile(mapOf("avatar_url" to publicUrl))
        previousUrl?.let { old -> StorageUploader.pathFromPublicUrl(old, "avatars")?.let { oldPath -> runCatching { bucket.delete(listOf(oldPath)) } } }
        return publicUrl
    }

    suspend fun hasBannerPlan(): Boolean = plansRepository.getMyPlanLimits().hasBanner

    suspend fun uploadBanner(context: Context, uri: Uri): String {
        if (!hasBannerPlan()) error(context.getString(R.string.profile_err_banner_plan))
        val id = uid()
        val ext = StorageUploader.safeImageExt(context, uri)
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: error(context.getString(R.string.common_err_read_file))
        val path = "$id/${System.currentTimeMillis()}.$ext"
        val bucket = supabase.storage.from("profile-banners")
        bucket.upload(path, bytes)
        val publicUrl = bucket.publicUrl(path)
        updateProfile(mapOf("banner_url" to publicUrl))
        return publicUrl
    }
}

@kotlinx.serialization.Serializable
private data class UserSecretsUpdate(
    val id: String,
    @kotlinx.serialization.SerialName("document_number") val documentNumber: String? = null,
    @kotlinx.serialization.SerialName("zip_code") val zipCode: String? = null,
    val street: String? = null,
    val number: String? = null,
    val complement: String? = null,
    val neighborhood: String? = null,
    @kotlinx.serialization.SerialName("phone_whatsapp") val phoneWhatsapp: String? = null,
)
