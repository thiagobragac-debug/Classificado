package br.com.tauzeclass.mobile.feature.auctions

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

sealed interface AuctionsListUiState {
    data object Loading : AuctionsListUiState
    data class Error(val message: String) : AuctionsListUiState
    data class Content(val events: List<AuctionEvent>, val filters: AuctionFilters) : AuctionsListUiState
}

@HiltViewModel
class AuctionsListViewModel @Inject constructor(
    private val repository: AuctionsRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<AuctionsListUiState>(AuctionsListUiState.Loading)
    val uiState: StateFlow<AuctionsListUiState> = _uiState.asStateFlow()
    private var currentFilters = AuctionFilters()
    private var loadJob: Job? = null

    init { load() }
    fun retry() = load()

    fun onStatusFilterChange(status: AuctionStatusFilter) {
        currentFilters = currentFilters.copy(status = status)
        load()
    }

    fun onSearchChange(query: String) {
        currentFilters = currentFilters.copy(search = query)
        load()
    }

    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): sem cancelar a chamada
    // anterior, trocar de filtro rapidamente (cliques nos chips) disparava
    // requisições concorrentes; quem completasse por ÚLTIMO escrevia em
    // _uiState.value, não quem foi disparado por último — em rede móvel
    // variável, o resultado de um filtro já trocado podia sobrescrever o
    // filtro atual. Cancelar o Job anterior antes de lançar um novo garante
    // que só a chamada mais recente realmente escreve o estado.
    private fun load() {
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.value = try {
                AuctionsListUiState.Content(repository.getAuctionEvents(currentFilters), currentFilters)
            } catch (e: Exception) {
                AuctionsListUiState.Error(appContext.getString(R.string.auctions_error_load_list))
            }
        }
    }
}
