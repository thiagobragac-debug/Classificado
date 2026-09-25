package br.com.tauzeclass.mobile.feature.messages

import android.content.Context
import br.com.tauzeclass.mobile.R
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * public.messages — colunas confirmadas ao vivo via REST (não existe
 * conversation_id/thread_id/is_read/attachment_url; "status" existe no banco
 * mas não é usado em nenhuma tela do site, mantido aqui só por paridade).
 */
@Serializable
data class MessageRow(
    val id: String,
    @SerialName("ad_id") val adId: String,
    @SerialName("sender_id") val senderId: String,
    @SerialName("receiver_id") val receiverId: String,
    val content: String,
    val status: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    // Embeds só vêm preenchidos nas queries via Postgrest — um payload de
    // realtime (postgres_changes) nunca traz embeds (é a linha crua da
    // tabela), então ficam null quando o MessageRow vem de decodeRecord()
    // no fluxo de realtime. Isso é esperado, não um bug.
    val sender: MessageProfile? = null,
    val receiver: MessageProfile? = null,
    val ads: MessageAd? = null,
)

@Serializable
data class MessageProfile(
    val id: String? = null,
    val name: String? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("avatar_url") val avatarUrl: String? = null,
    val verified: Boolean = false,
) {
    // Era uma property computada; virou função porque o fallback agora vem de
    // strings.xml (precisa de Context, indisponível numa property de data class).
    fun displayNameOrFallback(context: Context): String =
        displayName?.takeIf { it.isNotBlank() } ?: name?.takeIf { it.isNotBlank() } ?: context.getString(R.string.messages_user_fallback)
}

@Serializable
data class MessageAd(
    val id: String? = null,
    @SerialName("title_pt") val titlePt: String? = null,
    @SerialName("title_es") val titleEs: String? = null,
)

fun MessageAd?.displayTitle(context: Context): String = this?.titlePt?.takeIf { it.isNotBlank() } ?: context.getString(R.string.messages_ad_fallback)

fun MessageRow.otherId(myId: String): String = if (senderId == myId) receiverId else senderId
fun MessageRow.otherProfile(myId: String): MessageProfile? = if (senderId == myId) receiver else sender

@Serializable
internal data class MessageInsert(
    @SerialName("ad_id") val adId: String,
    @SerialName("sender_id") val senderId: String,
    @SerialName("receiver_id") val receiverId: String,
    val content: String,
)

// --- Conversa (100% client-side, sem tabela própria — mesma lógica de MessagesTab.tsx) ---

data class Conversation(
    val adId: String,
    val otherId: String,
    val otherName: String,
    val otherVerified: Boolean,
    val otherAvatarUrl: String?,
    val adTitle: String,
    val messages: List<MessageRow>, // ordenadas cronologicamente (asc)
) {
    val lastMessage: MessageRow get() = messages.last()
    val key: String get() = "${adId}__$otherId"
}

/** Mesmo agrupamento de MessagesTab.tsx: chave = ad_id + outro usuário. */
fun groupIntoConversations(rows: List<MessageRow>, myId: String, context: Context): List<Conversation> =
    rows.groupBy { "${it.adId}__${it.otherId(myId)}" }
        .map { (_, msgs) ->
            val sorted = msgs.sortedBy { it.createdAt.orEmpty() }
            val last = sorted.last()
            val otherProfile = last.otherProfile(myId)
            Conversation(
                adId = last.adId,
                otherId = last.otherId(myId),
                otherName = otherProfile?.displayNameOrFallback(context) ?: context.getString(R.string.messages_user_fallback),
                otherVerified = otherProfile?.verified ?: false,
                otherAvatarUrl = otherProfile?.avatarUrl,
                adTitle = last.ads.displayTitle(context),
                messages = sorted,
            )
        }
        .sortedByDescending { it.lastMessage.createdAt.orEmpty() }
