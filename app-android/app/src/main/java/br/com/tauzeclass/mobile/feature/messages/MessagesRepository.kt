package br.com.tauzeclass.mobile.feature.messages

import android.content.Context
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

private const val MESSAGE_COLUMNS =
    "id, ad_id, sender_id, receiver_id, content, status, created_at, " +
        "sender:profiles!messages_sender_id_fkey(id, name, display_name, avatar_url, verified), " +
        "receiver:profiles!messages_receiver_id_fkey(id, name, display_name, avatar_url, verified), " +
        "ads(id, title_pt, title_es)"

@Singleton
class MessagesRepository @Inject constructor(
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) {
    /** "Minhas mensagens" = sender OU receiver = eu. Duas queries com eq() em vez de or() (não usado em nenhum lugar deste app, evita assumir a assinatura). */
    suspend fun getMyMessages(myId: String): List<MessageRow> {
        val asReceiver = supabase.postgrest.from("messages").select(Columns.raw(MESSAGE_COLUMNS)) {
            filter { eq("receiver_id", myId) }
        }.decodeList<MessageRow>()
        val asSender = supabase.postgrest.from("messages").select(Columns.raw(MESSAGE_COLUMNS)) {
            filter { eq("sender_id", myId) }
        }.decodeList<MessageRow>()
        return (asReceiver + asSender).distinctBy { it.id }.sortedBy { it.createdAt.orEmpty() }
    }

    /** Mensagens de UMA conversa (ad_id + par de usuários), pra tela de chat — evita puxar o inbox inteiro. */
    suspend fun getConversation(adId: String, myId: String, otherId: String): List<MessageRow> {
        val sentByMe = supabase.postgrest.from("messages").select(Columns.raw(MESSAGE_COLUMNS)) {
            filter { eq("ad_id", adId); eq("sender_id", myId); eq("receiver_id", otherId) }
        }.decodeList<MessageRow>()
        val sentByOther = supabase.postgrest.from("messages").select(Columns.raw(MESSAGE_COLUMNS)) {
            filter { eq("ad_id", adId); eq("sender_id", otherId); eq("receiver_id", myId) }
        }.decodeList<MessageRow>()
        return (sentByMe + sentByOther).sortedBy { it.createdAt.orEmpty() }
    }

    /**
     * BUG REAL encontrado ao vivo (não estava na pesquisa, que leu AdMessageForm.tsx
     * chamando check_rate_limit direto do client): a migration
     * 20260830200000_fecha_bypass_rate_limit_via_rpc_direta.sql revogou EXECUTE de
     * anon/authenticated nessa RPC (ficou só service_role) — confirmado ao vivo via
     * curl com JWT real de usuário autenticado: 42501 "permission denied for
     * function check_rate_limit". Ou seja, o site também está quebrado nesse ponto
     * hoje (fora do escopo deste app corrigir). Aqui NÃO chamamos mais essa RPC —
     * o trigger enforce_message_rate_limit (BEFORE INSERT, 20 msgs/hora) já
     * protege a tabela no banco; seu erro P0001 é tratado no ViewModel.
     */
    suspend fun sendMessage(adId: String, receiverId: String, content: String): MessageRow? {
        val myId = supabase.auth.currentUserOrNull()?.id ?: error(appContext.getString(R.string.common_no_session))

        return supabase.postgrest.from("messages").insert(
            MessageInsert(adId = adId, senderId = myId, receiverId = receiverId, content = content)
        ) {
            select(Columns.raw(MESSAGE_COLUMNS))
        }.decodeSingleOrNull()
    }

    /**
     * Stream de eventos de postgres_changes relevantes ao usuário — mesmo padrão de
     * dois listeners do site: (1) qualquer evento onde receiver_id = eu, (2) só
     * INSERT onde sender_id = eu (pega minha própria msg inserida de outro device).
     * channelSuffix evita reusar o mesmo nome de canal em duas instâncias
     * simultâneas (inbox + tela de chat abertas ao mesmo tempo).
     */
    fun observeMyMessageEvents(userId: String, channelSuffix: String): Flow<PostgresAction> = callbackFlow {
        val realtimeChannel = supabase.channel("messages_user_${userId}_$channelSuffix")

        val anyEventAsReceiver = realtimeChannel.postgresChangeFlow<PostgresAction>(schema = "public") {
            table = "messages"
            filter("receiver_id", FilterOperator.EQ, userId)
        }
        val insertAsSender = realtimeChannel.postgresChangeFlow<PostgresAction.Insert>(schema = "public") {
            table = "messages"
            filter("sender_id", FilterOperator.EQ, userId)
        }

        val collectJob = launch {
            merge(anyEventAsReceiver, insertAsSender).collect { action -> trySend(action) }
        }

        realtimeChannel.subscribe() // suspend; connectOnSubscribe=true (default) conecta o client se preciso

        awaitClose {
            collectJob.cancel()
            CoroutineScope(Dispatchers.IO).launch { runCatching { realtimeChannel.unsubscribe() } }
        }
    }
}
