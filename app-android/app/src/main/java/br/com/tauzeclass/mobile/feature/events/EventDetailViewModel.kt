package br.com.tauzeclass.mobile.feature.events

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface EventDetailUiState {
    data object Loading : EventDetailUiState
    data object NotFound : EventDetailUiState
    data class Error(val message: String) : EventDetailUiState
    data class Content(val event: EventoAgro) : EventDetailUiState
}

@HiltViewModel
class EventDetailViewModel @Inject constructor(
    private val repository: EventsRepository,
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val eventId: String = checkNotNull(savedStateHandle["id"])
    private val _uiState = MutableStateFlow<EventDetailUiState>(EventDetailUiState.Loading)
    val uiState: StateFlow<EventDetailUiState> = _uiState.asStateFlow()

    init { load() }
    fun retry() = load()

    private fun load() {
        viewModelScope.launch {
            _uiState.value = try {
                val event = repository.getEventById(eventId)
                if (event != null) EventDetailUiState.Content(event) else EventDetailUiState.NotFound
            } catch (e: Exception) {
                EventDetailUiState.Error(appContext.getString(R.string.events_error_load_detail))
            }
        }
    }
}
