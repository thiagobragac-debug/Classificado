package br.com.tauzeclass.mobile.feature.ads

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

sealed interface AdDetailUiState {
    data object Loading : AdDetailUiState
    data object NotFound : AdDetailUiState
    data class Error(val message: String) : AdDetailUiState
    data class Content(
        val ad: AdDetail,
        val isFavorited: Boolean = false,
        val contactMessage: String? = null,
        val contactLoading: Boolean = false
    ) : AdDetailUiState
}

@HiltViewModel
class AdDetailViewModel @Inject constructor(
    private val adsRepository: AdsRepository,
    private val contactSellerService: ContactSellerService,
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val slug: String = checkNotNull(savedStateHandle["slug"])

    private val _uiState = MutableStateFlow<AdDetailUiState>(AdDetailUiState.Loading)
    val uiState: StateFlow<AdDetailUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun retry() = load()

    private fun load() {
        viewModelScope.launch {
            _uiState.value = AdDetailUiState.Loading
            try {
                val ad = adsRepository.getAdBySlug(slug)
                if (ad == null) {
                    _uiState.value = AdDetailUiState.NotFound
                } else {
                    val isFavorited = runCatching { adsRepository.getFavoriteAdIds().contains(ad.id) }.getOrDefault(false)
                    _uiState.value = AdDetailUiState.Content(ad, isFavorited)
                    // Efeito colateral, não deve travar a tela se falhar (mesma
                    // filosofia do site: contagem de view nunca bloqueia a UI).
                    runCatching { adsRepository.incrementAdView(ad.id) }
                }
            } catch (e: Exception) {
                android.util.Log.e("TC_AD_DETAIL", "Falha ao carregar anuncio slug=$slug", e)
                _uiState.value = AdDetailUiState.Error(appContext.getString(R.string.ads_error_load_detail))
            }
        }
    }

    fun onFavoriteToggle() {
        val current = _uiState.value as? AdDetailUiState.Content ?: return
        val wasFavorited = current.isFavorited
        _uiState.value = current.copy(isFavorited = !wasFavorited)
        viewModelScope.launch {
            try {
                adsRepository.toggleFavorite(current.ad.id)
            } catch (e: Exception) {
                (_uiState.value as? AdDetailUiState.Content)?.let {
                    _uiState.value = it.copy(isFavorited = wasFavorited)
                }
            }
        }
    }

    fun onContactSellerClick(onWhatsappUrlReady: (String) -> Unit) {
        val current = _uiState.value as? AdDetailUiState.Content ?: return
        viewModelScope.launch {
            _uiState.value = current.copy(contactLoading = true, contactMessage = null)
            when (val outcome = contactSellerService.getWhatsappUrl(current.ad.id)) {
                is ContactSellerOutcome.Success -> {
                    _uiState.value = (_uiState.value as? AdDetailUiState.Content)?.copy(contactLoading = false) ?: _uiState.value
                    onWhatsappUrlReady(outcome.whatsappUrl)
                }
                is ContactSellerOutcome.Failure -> {
                    _uiState.value = (_uiState.value as? AdDetailUiState.Content)
                        ?.copy(contactLoading = false, contactMessage = outcome.message) ?: _uiState.value
                }
            }
        }
    }
}
