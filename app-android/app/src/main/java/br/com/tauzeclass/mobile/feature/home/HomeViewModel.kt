package br.com.tauzeclass.mobile.feature.home

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.Ad
import br.com.tauzeclass.mobile.feature.ads.AdsRepository
import br.com.tauzeclass.mobile.feature.auctions.AuctionEvent
import br.com.tauzeclass.mobile.feature.auctions.AuctionFilters
import br.com.tauzeclass.mobile.feature.auctions.AuctionStatusFilter
import br.com.tauzeclass.mobile.feature.auctions.AuctionsRepository
import br.com.tauzeclass.mobile.feature.events.EventoAgro
import br.com.tauzeclass.mobile.feature.events.EventsRepository
import br.com.tauzeclass.mobile.feature.listagem.Category
import br.com.tauzeclass.mobile.feature.listagem.ListagemRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

sealed interface HomeUiState {
    data object Loading : HomeUiState
    data class Error(val message: String) : HomeUiState
    data class Content(
        val featuredAds: List<Ad>,
        val recentAds: List<Ad>,
        val favoriteAdIds: Set<String> = emptySet(),
        val pendingFavoriteIds: Set<String> = emptySet(),
        val categories: List<Category> = emptyList(),
        val stats: PlatformStats? = null,
        val userDisplayName: String? = null,
        val liveAuctions: List<AuctionEvent> = emptyList(),
        val upcomingEvents: List<EventoAgro> = emptyList(),
    ) : HomeUiState
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val adsRepository: AdsRepository,
    private val listagemRepository: ListagemRepository,
    private val platformStatsRepository: PlatformStatsRepository,
    private val auctionsRepository: AuctionsRepository,
    private val eventsRepository: EventsRepository,
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.value = HomeUiState.Loading
            try {
                // Chamadas independentes -- mantidas sequenciais por
                // simplicidade; paralelizar com async{} se a latência
                // combinada incomodar conforme a tela crescer.
                val featured = adsRepository.getFeaturedAds()
                val recent = adsRepository.getRecentAds()
                val favoriteIds = runCatching { adsRepository.getFavoriteAdIds() }.getOrDefault(emptySet())
                val categories = runCatching { listagemRepository.getCategories() }.getOrDefault(emptyList())
                val stats = runCatching { platformStatsRepository.getPlatformStats() }.getOrNull()
                val userName = runCatching {
                    supabase.auth.currentUserOrNull()?.userMetadata
                        ?.get("full_name")?.jsonPrimitive?.contentOrNull
                        ?.substringBefore(" ")
                }.getOrNull()
                val liveAuctions = runCatching {
                    auctionsRepository.getAuctionEvents(AuctionFilters(status = AuctionStatusFilter.ATIVOS)).take(5)
                }.getOrDefault(emptyList())
                val upcomingEvents = runCatching { eventsRepository.getUpcomingEvents() }.getOrDefault(emptyList())
                _uiState.value = HomeUiState.Content(featured, recent, favoriteIds, categories, stats, userName, liveAuctions, upcomingEvents)
            } catch (e: Exception) {
                _uiState.value = HomeUiState.Error(appContext.getString(R.string.home_error_load_ads))
            }
        }
    }

    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): toggle_favorite_atomic é
    // um FLIP real no servidor, não um "set true/false" idempotente — sem
    // guarda de reentrância, um toque duplo rápido no mesmo anúncio disparava
    // 2 chamadas concorrentes; se uma delas falhasse depois que a outra já
    // tivesse mudado o estado local/servidor, a reversão otimista aplicava a
    // inversão errada em cima do estado já correto, dessincronizando o
    // cliente até o próximo load(). Ignorar toques repetidos no MESMO adId
    // enquanto uma chamada já está em voo elimina a concorrência na origem.
    fun onFavoriteToggle(adId: String) {
        val current = _uiState.value as? HomeUiState.Content ?: return
        if (adId in current.pendingFavoriteIds) return
        val wasFavorited = current.favoriteAdIds.contains(adId)
        // Otimista: atualiza a UI na hora, reverte se a chamada falhar.
        _uiState.value = current.copy(
            favoriteAdIds = if (wasFavorited) current.favoriteAdIds - adId else current.favoriteAdIds + adId,
            pendingFavoriteIds = current.pendingFavoriteIds + adId,
        )
        viewModelScope.launch {
            try {
                adsRepository.toggleFavorite(adId)
                val done = _uiState.value as? HomeUiState.Content ?: return@launch
                _uiState.value = done.copy(pendingFavoriteIds = done.pendingFavoriteIds - adId)
            } catch (e: Exception) {
                val stateNow = _uiState.value as? HomeUiState.Content ?: return@launch
                _uiState.value = stateNow.copy(
                    favoriteAdIds = if (wasFavorited) stateNow.favoriteAdIds + adId else stateNow.favoriteAdIds - adId,
                    pendingFavoriteIds = stateNow.pendingFavoriteIds - adId,
                )
            }
        }
    }
}
