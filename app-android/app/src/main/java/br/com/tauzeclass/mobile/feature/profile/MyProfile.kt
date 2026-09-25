package br.com.tauzeclass.mobile.feature.profile

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import br.com.tauzeclass.mobile.R
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** profiles — mesmo select de page.tsx do Painel (banner_url confirmado existir via SellerProfile). */
@Serializable
data class ProfileRow(
    val id: String,
    val name: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    @SerialName("banner_url") val bannerUrl: String? = null,
    val bio: String? = null,
    val city: String? = null,
    val state: String? = null,
    val country: String = "BR",
    @SerialName("kyc_status") val kycStatus: String? = null,
    @SerialName("email_verified") val emailVerified: Boolean = false,
    @SerialName("phone_verified") val phoneVerified: Boolean = false,
)

/** user_secrets — campos "secretos" que o site separa de profiles (SECRET_KEYS, lib/supabase.ts:768). */
@Serializable
data class UserSecretsRow(
    @SerialName("plan_id") val planId: String? = null,
    @SerialName("document_number") val documentNumber: String? = null,
    @SerialName("zip_code") val zipCode: String? = null,
    val street: String? = null,
    val number: String? = null,
    val complement: String? = null,
    val neighborhood: String? = null,
    @SerialName("phone_whatsapp") val phoneWhatsapp: String? = null,
)

data class MyProfile(val profile: ProfileRow, val secrets: UserSecretsRow)

/** Espelha SECRET_KEYS de lib/supabase.ts:768 — campos fora desta lista gravam em profiles, os desta lista em user_secrets. */
val PROFILE_SECRET_KEYS = setOf(
    "document_number", "zip_code", "street", "number", "complement", "neighborhood", "phone_whatsapp"
)

/** Formulário editável — separado do modelo de leitura pra não confundir o que é editável com o que é só exibição (kyc_status, verified etc.). */
data class ProfileFormValues(
    val name: String = "",
    val displayName: String = "",
    val documentNumber: String = "",
    val phoneWhatsapp: String = "",
    val zipCode: String = "",
    val street: String = "",
    val number: String = "",
    val complement: String = "",
    val neighborhood: String = "",
    val city: String = "",
    val state: String = "",
    val country: String = "BR",
    val bio: String = "",
) {
    companion object {
        fun fromProfile(profile: ProfileRow, secrets: UserSecretsRow) = ProfileFormValues(
            name = profile.name.orEmpty(),
            displayName = profile.displayName.orEmpty(),
            documentNumber = secrets.documentNumber.orEmpty(),
            phoneWhatsapp = secrets.phoneWhatsapp.orEmpty(),
            zipCode = secrets.zipCode.orEmpty(),
            street = secrets.street.orEmpty(),
            number = secrets.number.orEmpty(),
            complement = secrets.complement.orEmpty(),
            neighborhood = secrets.neighborhood.orEmpty(),
            city = profile.city.orEmpty(),
            state = profile.state.orEmpty(),
            country = profile.country,
            bio = profile.bio.orEmpty(),
        )
    }

    /** Mapa campo(nome real da coluna)->valor, já normalizado, pronto pra ProfileRepository.updateProfile particionar. */
    fun toPayloadMap(): Map<String, String?> = mapOf(
        "name" to name.trim(),
        "display_name" to displayName.trim().ifBlank { null },
        "document_number" to documentNumber.filter(Char::isDigit).ifBlank { null },
        "phone_whatsapp" to phoneWhatsapp.trim().ifBlank { null },
        "zip_code" to zipCode.trim().ifBlank { null },
        "street" to street.trim().ifBlank { null },
        "number" to number.trim().ifBlank { null },
        "complement" to complement.trim().ifBlank { null },
        "neighborhood" to neighborhood.trim().ifBlank { null },
        "city" to city.trim().ifBlank { null },
        "state" to state.trim().ifBlank { null },
        "country" to country,
        "bio" to bio.trim().ifBlank { null },
    )
}

/**
 * Lista de países exibida no dropdown de Endereço do Perfil. Precisa ser resolvida dentro de
 * composição (stringResource requer contexto de @Composable) — por isso virou função composable
 * em vez de `val` de nível de topo; o único call site é ProfileScreen.kt/ProfileForm.
 */
@Composable
fun profileCountries(): List<Pair<String, String>> = listOf(
    "BR" to stringResource(R.string.country_brasil),
    "AR" to stringResource(R.string.country_argentina),
    "PY" to stringResource(R.string.country_paraguai),
    "UY" to stringResource(R.string.country_uruguai),
    "BO" to stringResource(R.string.country_bolivia),
)
