package br.com.tauzeclass.mobile.feature.institucional

import android.content.Context
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

sealed class InstitucionalUiState {
    data object Loading : InstitucionalUiState()
    data class Error(val message: String) : InstitucionalUiState()
    data class Content(val pages: List<InstitutionalPage>) : InstitucionalUiState()
}

@HiltViewModel
class InstitucionalViewModel @Inject constructor(
    private val repository: InstitucionalRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<InstitucionalUiState>(InstitucionalUiState.Loading)
    val uiState: StateFlow<InstitucionalUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.value = InstitucionalUiState.Loading
            _uiState.value = try {
                InstitucionalUiState.Content(repository.getPages())
            } catch (e: Exception) {
                InstitucionalUiState.Error(appContext.getString(R.string.institucional_error_load))
            }
        }
    }
}
