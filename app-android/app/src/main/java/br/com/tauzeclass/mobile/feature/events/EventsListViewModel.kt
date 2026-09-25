package br.com.tauzeclass.mobile.feature.events

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface EventsListUiState {
    data object Loading : EventsListUiState
    data class Error(val message: String) : EventsListUiState
    data class Content(val events: List<EventoAgro>) : EventsListUiState
}

@HiltViewModel
class EventsListViewModel @Inject constructor(
    private val repository: EventsRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<EventsListUiState>(EventsListUiState.Loading)
    val uiState: StateFlow<EventsListUiState> = _uiState.asStateFlow()
    private var search = ""
    private var loadJob: Job? = null

    init { load() }
    fun retry() = load()

    fun onSearchChange(query: String) {
        search = query
        load()
    }

    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): mesmo padrão de
    // AuctionsListViewModel — sem cancelar a chamada anterior, buscas
    // espaçadas por mais que o debounce da tela ainda podiam completar fora
    // de ordem e sobrescrever o resultado da busca mais recente.
    private fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.value = try {
                EventsListUiState.Content(repository.getEvents(EventFilters(search)))
            } catch (e: Exception) {
                EventsListUiState.Error(appContext.getString(R.string.events_error_load_list))
            }
        }
    }
}
