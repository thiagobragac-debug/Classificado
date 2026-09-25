package br.com.tauzeclass.mobile.feature.myads

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class MyAdsUiState {
    data object Loading : MyAdsUiState()
    data class Error(val message: String) : MyAdsUiState()
    data class Content(val ads: List<MyAd>, val page: Int, val total: Long, val pageSize: Int = 10) : MyAdsUiState() {
        val totalPages: Int get() = if (total == 0L) 1 else ((total + pageSize - 1) / pageSize).toInt()
    }
}

@HiltViewModel
class MyAdsViewModel @Inject constructor(
    private val repository: MyAdsRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<MyAdsUiState>(MyAdsUiState.Loading)
    val uiState: StateFlow<MyAdsUiState> = _uiState.asStateFlow()

    private val _filter = MutableStateFlow(AdStatusFilter.ALL)
    val filter: StateFlow<AdStatusFilter> = _filter.asStateFlow()

    private val _events = MutableSharedFlow<String>()
    val events: SharedFlow<String> = _events

    init { load(page = 1) }

    fun retry() = load(page = 1)
    fun onPageChange(page: Int) = load(page)

    fun onFilterChange(newFilter: AdStatusFilter) {
        _filter.value = newFilter
        load(page = 1)
    }

    private fun load(page: Int) {
        viewModelScope.launch {
            _uiState.value = MyAdsUiState.Loading
            _uiState.value = try {
                val (ads, total) = repository.getMyAds(_filter.value, page)
                MyAdsUiState.Content(ads, page, total)
            } catch (e: Exception) {
                MyAdsUiState.Error(appContext.getString(R.string.myads_error_load))
            }
        }
    }

    fun onTogglePause(ad: MyAd) {
        val newStatus = if (ad.status == "paused") "active" else "paused"
        viewModelScope.launch {
            try {
                repository.toggleStatus(ad.id, newStatus)
                _events.emit(if (newStatus == "paused") appContext.getString(R.string.myads_toast_paused) else appContext.getString(R.string.myads_toast_reactivated))
                retryCurrentPage()
            } catch (e: PostgrestRestException) {
                _events.emit(if (e.code == "P0001") e.message ?: appContext.getString(R.string.myads_error_plan_limit) else appContext.getString(R.string.myads_error_update))
            } catch (e: Exception) {
                _events.emit(appContext.getString(R.string.myads_error_update))
            }
        }
    }

    fun onDelete(ad: MyAd) {
        viewModelScope.launch {
            try {
                repository.deleteAd(ad.id)
                _events.emit(appContext.getString(R.string.myads_toast_deleted))
                retryCurrentPage()
            } catch (e: Exception) {
                _events.emit(appContext.getString(R.string.myads_error_delete))
            }
        }
    }

    private fun retryCurrentPage() {
        val page = (_uiState.value as? MyAdsUiState.Content)?.page ?: 1
        load(page)
    }
}
