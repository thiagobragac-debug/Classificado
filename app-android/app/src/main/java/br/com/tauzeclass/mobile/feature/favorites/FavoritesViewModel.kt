package br.com.tauzeclass.mobile.feature.favorites

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.Ad
import br.com.tauzeclass.mobile.feature.ads.AdsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface FavoritesUiState {
    data object Loading : FavoritesUiState
    data class Error(val message: String) : FavoritesUiState
    data class Content(val favoriteAds: List<Ad>, val pendingIds: Set<String> = emptySet()) : FavoritesUiState
}

@HiltViewModel
class FavoritesViewModel @Inject constructor(
    private val adsRepository: AdsRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<FavoritesUiState>(FavoritesUiState.Loading)
    val uiState: StateFlow<FavoritesUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = FavoritesUiState.Loading
            try {
                _uiState.value = FavoritesUiState.Content(adsRepository.getFavoriteAds())
            } catch (e: Exception) {
                _uiState.value = FavoritesUiState.Error(appContext.getString(R.string.favorites_error_load))
            }
        }
    }

    /**
     * Remover dos favoritos aqui sempre desfavorita (a tela só lista quem já
     * é favorito). Guarda de reentrância (auditoria ao vivo, 2026-09-25):
     * toggle_favorite_atomic é um FLIP real — sem isso, um toque duplo
     * rápido dispararia 2 chamadas concorrentes pro mesmo id.
     */
    fun onRemoveFavorite(adId: String) {
        val current = _uiState.value as? FavoritesUiState.Content ?: return
        if (adId in current.pendingIds) return
        _uiState.value = current.copy(
            favoriteAds = current.favoriteAds.filterNot { it.id == adId },
            pendingIds = current.pendingIds + adId,
        )
        viewModelScope.launch {
            try {
                adsRepository.toggleFavorite(adId)
            } catch (e: Exception) {
                load() // estado local pode ter ficado incoerente — recarrega do servidor
            }
        }
    }
}
