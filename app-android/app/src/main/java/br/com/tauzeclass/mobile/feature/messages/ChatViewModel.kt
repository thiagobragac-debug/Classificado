package br.com.tauzeclass.mobile.feature.messages

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface ChatUiState {
    data object Loading : ChatUiState
    data class Error(val message: String) : ChatUiState
    data class Content(
        val myId: String,
        val adId: String,
        val otherId: String,
        val otherName: String,
        val otherVerified: Boolean,
        val adTitle: String,
        val messages: List<MessageRow>,
        val draft: String = "",
        val sending: Boolean = false,
        val errorMessage: String? = null,
    ) : ChatUiState
}

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val repository: MessagesRepository,
    private val supabase: SupabaseClient,
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val adId: String = checkNotNull(savedStateHandle["adId"])
    private val otherId: String = checkNotNull(savedStateHandle["otherId"])
    // Fallback de header pra conversa ainda vazia — vem da tela de origem, evitando
    // uma query extra só pra popular o topo da tela.
    private val fallbackOtherName: String = savedStateHandle.get<String>("otherName").orEmpty().ifBlank { appContext.getString(R.string.messages_user_fallback) }
    private val fallbackAdTitle: String = savedStateHandle.get<String>("adTitle").orEmpty().ifBlank { appContext.getString(R.string.messages_ad_fallback) }

    private val _uiState = MutableStateFlow<ChatUiState>(ChatUiState.Loading)
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private var realtimeStarted = false

    init { load() }

    fun retry() = load()

    private fun load() {
        viewModelScope.launch {
            val myId = supabase.auth.currentUserOrNull()?.id
            if (myId == null) {
                _uiState.value = ChatUiState.Error(appContext.getString(R.string.common_session_expired))
                return@launch
            }
            _uiState.value = try {
                val rows = repository.getConversation(adId, myId, otherId)
                val last = rows.lastOrNull()
                val otherProfile = last?.otherProfile(myId)
                ChatUiState.Content(
                    myId = myId, adId = adId, otherId = otherId,
                    otherName = otherProfile?.displayNameOrFallback(appContext) ?: fallbackOtherName,
                    otherVerified = otherProfile?.verified ?: false,
                    adTitle = last?.ads?.displayTitle(appContext) ?: fallbackAdTitle,
                    messages = rows,
                )
            } catch (e: Exception) {
                ChatUiState.Error(appContext.getString(R.string.chat_error_load))
            }
            observeRealtime(myId)
        }
    }

    /**
     * Decodifica o payload direto (decodeRecord) em vez de refazer a query
     * inteira — a bolha de chat só precisa de id/senderId/content/createdAt,
     * nenhum embed. Filtra client-side pro par (adId, otherId) desta tela, já
     * que postgres_changes só aceita 1 filtro de coluna por listener. Escopo do
     * MVP: só INSERT é tratado (não existe policy de UPDATE em messages, e
     * DELETE enquanto a tela está aberta não é tratado — a msg some só ao
     * reabrir a conversa).
     */
    private fun observeRealtime(myId: String) {
        if (realtimeStarted) return
        realtimeStarted = true
        viewModelScope.launch {
            repository.observeMyMessageEvents(myId, channelSuffix = "chat_${adId}_$otherId").collect { action ->
                if (action !is PostgresAction.Insert) return@collect
                val row = runCatching { action.decodeRecord<MessageRow>() }.getOrNull() ?: return@collect
                if (row.adId == adId && row.otherId(myId) == otherId) appendIfNew(row)
            }
        }
    }

    private fun appendIfNew(row: MessageRow) {
        val current = _uiState.value as? ChatUiState.Content ?: return
        if (current.messages.any { it.id == row.id }) return // evita duplicar eco do meu próprio insert
        _uiState.value = current.copy(messages = current.messages + row)
    }

    fun onDraftChange(text: String) {
        val current = _uiState.value as? ChatUiState.Content ?: return
        _uiState.value = current.copy(draft = text.take(2000)) // teto real do banco (messages_content_length_check)
    }

    fun onSend() {
        val current = _uiState.value as? ChatUiState.Content ?: return
        val text = current.draft.trim()
        if (text.isEmpty() || current.sending) return
        _uiState.value = current.copy(sending = true, errorMessage = null)
        viewModelScope.launch {
            try {
                val inserted = repository.sendMessage(adId, otherId, text)
                val now = _uiState.value as? ChatUiState.Content ?: current
                _uiState.value = now.copy(
                    draft = "", sending = false,
                    messages = if (inserted != null && now.messages.none { it.id == inserted.id }) now.messages + inserted else now.messages
                )
            } catch (e: PostgrestRestException) {
                setSendError(current, if (e.code == "P0001") appContext.getString(R.string.chat_error_rate_limit) else appContext.getString(R.string.chat_error_send))
            } catch (e: Exception) {
                setSendError(current, appContext.getString(R.string.chat_error_send_offline))
            }
        }
    }

    private fun setSendError(fallback: ChatUiState.Content, msg: String) {
        val now = _uiState.value as? ChatUiState.Content ?: fallback
        _uiState.value = now.copy(sending = false, errorMessage = msg)
    }
}
