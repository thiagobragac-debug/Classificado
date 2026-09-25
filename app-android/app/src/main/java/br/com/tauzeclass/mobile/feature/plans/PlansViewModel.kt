package br.com.tauzeclass.mobile.feature.plans

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.ui.LocaleManager
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface PlansUiState {
    data object Loading : PlansUiState
    data class Error(val message: String) : PlansUiState
    data class Content(
        val plans: List<Plan>,
        val currentPlanId: String?,
        val billingCycle: BillingCycle = BillingCycle.MONTHLY,
        val useUsd: Boolean = false,
    ) : PlansUiState
}

@HiltViewModel
class PlansViewModel @Inject constructor(
    private val repository: PlansRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<PlansUiState>(PlansUiState.Loading)
    val uiState: StateFlow<PlansUiState> = _uiState.asStateFlow()

    init { load() }
    fun retry() = load()

    private fun load() {
        viewModelScope.launch {
            _uiState.value = PlansUiState.Loading
            try {
                val plans = repository.getActivePlans()
                val currentPlanId = runCatching { repository.getMyPlanId() }.getOrNull()
                val lang = LocaleManager.currentLanguageTag()?.take(2)?.takeIf { it == "es" } ?: "pt"
                val useUsd = repository.shouldUseUsd(lang)
                _uiState.value = PlansUiState.Content(plans, currentPlanId, useUsd = useUsd)
            } catch (e: Exception) {
                _uiState.value = PlansUiState.Error(appContext.getString(R.string.plans_error_load))
            }
        }
    }

    fun onBillingCycleChange(cycle: BillingCycle) {
        val c = _uiState.value as? PlansUiState.Content ?: return
        _uiState.value = c.copy(billingCycle = cycle)
    }
}
