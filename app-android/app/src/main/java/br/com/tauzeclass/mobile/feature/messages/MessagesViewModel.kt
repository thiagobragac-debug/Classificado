package br.com.tauzeclass.mobile.feature.messages

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface MessagesUiState {
    data object Loading : MessagesUiState
    data class Error(val message: String) : MessagesUiState
    data class Content(val conversations: List<Conversation>) : MessagesUiState
}

@HiltViewModel
class MessagesViewModel @Inject constructor(
    private val repository: MessagesRepository,
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<MessagesUiState>(MessagesUiState.Loading)
    val uiState: StateFlow<MessagesUiState> = _uiState.asStateFlow()

    init {
        load()
        observeRealtime()
    }

    fun retry() = load()

    private fun load() {
        viewModelScope.launch {
            val myId = supabase.auth.currentUserOrNull()?.id
            if (myId == null) {
                _uiState.value = MessagesUiState.Error(appContext.getString(R.string.common_session_expired))
                return@launch
            }
            _uiState.value = try {
                MessagesUiState.Content(groupIntoConversations(repository.getMyMessages(myId), myId, appContext))
            } catch (e: Exception) {
                MessagesUiState.Error(appContext.getString(R.string.messages_error_load))
            }
        }
    }

    /**
     * Igual ao site: o payload do evento não é usado pra reconstrução otimista —
     * só dispara refetch (o payload de postgres_changes não traz os embeds que a
     * lista precisa exibir: nome do outro usuário, título do anúncio).
     */
    private fun observeRealtime() {
        viewModelScope.launch {
            val myId = supabase.auth.currentUserOrNull()?.id ?: return@launch
            repository.observeMyMessageEvents(myId, channelSuffix = "inbox").collect { load() }
        }
    }
    // Sem onCleared() manual: viewModelScope é cancelado automaticamente quando o
    // usuário sai do Painel, o que cancela o collect acima, acionando awaitClose
    // no repositório (job.cancel() + channel.unsubscribe()).
}
