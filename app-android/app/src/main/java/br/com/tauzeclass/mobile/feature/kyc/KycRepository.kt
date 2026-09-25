package br.com.tauzeclass.mobile.feature.kyc

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.media.StorageUploader
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.storage.storage
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

/** Mesma regra do site (VerificacaoClient.tsx:101) — sem dígito verificador, só contagem de dígitos. */
enum class KycDocType(val value: String) {
    PESSOA_FISICA("pessoa_fisica"), PESSOA_JURIDICA("pessoa_juridica");
    companion object {
        fun fromDigits(digits: String) = if (digits.length <= 11) PESSOA_FISICA else PESSOA_JURIDICA
    }
}

enum class KycFileError { INVALID_TYPE, TOO_LARGE }

@Serializable
private data class VerificationRequestInsert(
    @SerialName("user_id") val userId: String,
    @SerialName("document_front") val documentFront: String,
    @SerialName("document_back") val documentBack: String,
    val selfie: String,
    val status: String = "pending",
    @SerialName("cpf_cnpj") val cpfCnpj: String,
    val type: String,
)

@Serializable
private data class VerificationStatusRow(val status: String)

@Serializable
private data class ProfileVerificationRow(
    val verified: Boolean = false,
    @SerialName("kyc_status") val kycStatus: String? = null,
)

/**
 * `verification_requests` não tem CREATE TABLE versionado — foi criada
 * direto em produção (confirmado via comentário da própria migration de
 * RLS). Colunas usadas aqui reconstruídas a partir do que o site grava/lê
 * de verdade, não de um schema.sql: id, user_id, document_front,
 * document_back, selfie (todos PATH do Storage, nunca URL — bucket
 * privado), status (pending/approved/rejected, sem CHECK no banco, só
 * convenção), cpf_cnpj, type, reason (só admin escreve/lê), created_at,
 * updated_at.
 *
 * RLS: dono só tem INSERT e SELECT das próprias linhas — sem UPDATE/DELETE,
 * não dá pra cancelar ou editar um pedido pendente, só reenviar (nova
 * linha). Aprovar/rejeitar é 100% responsabilidade do admin (service_role).
 */
@Singleton
class KycRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    suspend fun getProfileVerification(userId: String): Pair<Boolean, String?> {
        val row = supabase.postgrest.from("profiles").select(Columns.raw("verified, kyc_status")) {
            filter { eq("id", userId) }
        }.decodeSingle<ProfileVerificationRow>()
        return row.verified to row.kycStatus
    }

    suspend fun getLatestRequestStatus(userId: String): String? =
        supabase.postgrest.from("verification_requests").select(Columns.raw("status")) {
            filter { eq("user_id", userId) }
            order("created_at", Order.DESCENDING)
            limit(1)
        }.decodeList<VerificationStatusRow>().firstOrNull()?.status

    /** Mesma checagem do site (validateFile, VerificacaoClient.tsx:181-191): só type/size, sem ler o arquivo inteiro. */
    fun validateFile(context: Context, uri: Uri): KycFileError? {
        val mime = context.contentResolver.getType(uri)
        if (mime == null || !mime.startsWith("image/")) return KycFileError.INVALID_TYPE
        val size = context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val idx = c.getColumnIndex(OpenableColumns.SIZE)
                if (idx >= 0 && !c.isNull(idx)) c.getLong(idx) else null
            } else null
        }
        if (size != null && size > MAX_FILE_BYTES) return KycFileError.TOO_LARGE
        return null
    }

    /**
     * Upload cru — SEM resize/compressão/marca d'água, diferente do
     * pipeline de fotos de anúncio (AdImageProcessor). Confirmado lendo
     * VerificacaoClient.tsx: documento de identidade e selfie vão pro
     * Storage exatamente como o usuário selecionou, só validados por
     * type/size — reamostrar reduziria a qualidade que a análise humana
     * precisa pra conferir o documento.
     */
    suspend fun uploadDocument(context: Context, userId: String, uri: Uri, suffix: String): String {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: error(context.getString(R.string.common_err_read_file))
        if (bytes.size > MAX_FILE_BYTES) error(context.getString(R.string.kyc_err_file_size))
        val ext = StorageUploader.safeImageExt(context, uri)
        val path = "$userId/${System.currentTimeMillis()}_$suffix.$ext"
        supabase.storage.from("kyc-docs").upload(path, bytes)
        return path
    }

    suspend fun submit(
        userId: String,
        frontPath: String,
        backPath: String,
        selfiePath: String,
        cpfCnpjDigits: String,
        type: KycDocType,
    ) {
        supabase.postgrest.from("verification_requests").insert(
            VerificationRequestInsert(
                userId = userId, documentFront = frontPath, documentBack = backPath, selfie = selfiePath,
                cpfCnpj = cpfCnpjDigits, type = type.value,
            )
        )
    }

    companion object {
        const val MAX_FILE_BYTES = 10 * 1024 * 1024
    }
}
