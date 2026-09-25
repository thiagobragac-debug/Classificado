package br.com.tauzeclass.mobile.feature.auctions

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.formatPrice
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.realtime.decodeRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface AuctionDetailUiState {
    data object Loading : AuctionDetailUiState
    data class Error(val message: String) : AuctionDetailUiState
    data class Content(
        val event: AuctionEvent,
        val lots: List<AuctionLot>,
        val myUserId: String?,
        val selectedLot: AuctionLot? = null,
        val pendingBidAmount: Double? = null,
        val manualBidText: String = "",
        val bidding: Boolean = false,
        val bidErrorMessage: String? = null,
    ) : AuctionDetailUiState {
        val state: AuctionEventState get() = event.resolveState()
    }
}

@HiltViewModel
class AuctionDetailViewModel @Inject constructor(
    private val repository: AuctionsRepository,
    private val supabase: SupabaseClient,
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val slug: String = checkNotNull(savedStateHandle["slug"])
    private val _uiState = MutableStateFlow<AuctionDetailUiState>(AuctionDetailUiState.Loading)
    val uiState: StateFlow<AuctionDetailUiState> = _uiState.asStateFlow()
    private var realtimeStarted = false

    init { load() }
    fun retry() = load()

    private fun load() {
        viewModelScope.launch {
            val event = try {
                repository.getAuctionBySlug(slug)
            } catch (e: Exception) {
                _uiState.value = AuctionDetailUiState.Error(appContext.getString(R.string.auctions_error_load_detail))
                return@launch
            }
            if (event == null) {
                _uiState.value = AuctionDetailUiState.Error(appContext.getString(R.string.auctions_not_found))
                return@launch
            }
            _uiState.value = try {
                val lots = repository.getLots(event.id)
                val myId = supabase.auth.currentUserOrNull()?.id
                AuctionDetailUiState.Content(event = event, lots = lots, myUserId = myId)
            } catch (e: Exception) {
                AuctionDetailUiState.Error(appContext.getString(R.string.auctions_error_load_lots))
            }
            observeRealtime()
        }
    }

    /** Chamado pelo CountdownText quando chega a zero — não confia em status desatualizado, refaz load() pra pegar o status real ('live') do servidor. */
    fun onCountdownExpired() = load()

    private fun observeRealtime() {
        if (realtimeStarted) return
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        realtimeStarted = true
        viewModelScope.launch {
            repository.observeLotUpdates(current.event.id).collect { action ->
                val updated = runCatching { action.decodeRecord<AuctionLot>() }.getOrNull() ?: return@collect
                mergeLotUpdate(updated)
            }
        }
    }

    private fun mergeLotUpdate(updated: AuctionLot) {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        _uiState.value = current.copy(
            lots = current.lots.map { if (it.id == updated.id) updated else it },
            selectedLot = if (current.selectedLot?.id == updated.id) updated else current.selectedLot
        )
    }

    // --- Bottom sheet de lance por lote ---

    fun onLotClick(lot: AuctionLot) {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        _uiState.value = current.copy(selectedLot = lot, pendingBidAmount = null, manualBidText = "", bidErrorMessage = null)
    }

    fun onDismissLotSheet() {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        _uiState.value = current.copy(selectedLot = null, pendingBidAmount = null, manualBidText = "", bidErrorMessage = null)
    }

    fun onManualBidTextChange(text: String) {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        _uiState.value = current.copy(manualBidText = text)
    }

    /** Mesma sequência de avisos antecipados de requestBid() em LotBiddingModal.tsx — o RPC continua sendo a validação real, isto só evita abrir uma confirmação que o servidor vai rejeitar na certa. */
    fun requestBid(amount: Double) {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        val lot = current.selectedLot ?: return
        when {
            current.state == AuctionEventState.CANCELLED ->
                setBidError(appContext.getString(R.string.auctions_toast_cancelled))
            current.state != AuctionEventState.LIVE ->
                setBidError(appContext.getString(R.string.auctions_toast_not_live))
            current.myUserId == null ->
                setBidError(appContext.getString(R.string.auctions_login_required))
            amount < lot.minValidBid(current.event.step) ->
                setBidError(appContext.getString(R.string.auctions_err_bid_too_low, formatPrice(lot.minValidBid(current.event.step), "BRL")))
            else ->
                _uiState.value = current.copy(pendingBidAmount = amount, bidErrorMessage = null)
        }
    }

    fun requestManualBid() {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        val amount = parseBrlAmount(current.manualBidText)
        if (amount == null || amount <= 0.0) {
            setBidError(appContext.getString(R.string.auctions_err_empty_bid))
            return
        }
        requestBid(amount)
    }

    fun cancelPendingBid() {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        _uiState.value = current.copy(pendingBidAmount = null)
    }

    fun confirmBid() {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        val lot = current.selectedLot ?: return
        val amount = current.pendingBidAmount ?: return
        _uiState.value = current.copy(bidding = true, bidErrorMessage = null)
        viewModelScope.launch {
            val result = try {
                repository.placeLotBid(lot.id, amount)
            } catch (e: Exception) {
                PlaceBidResult(success = false, error = appContext.getString(R.string.auctions_err_bid_network))
            }
            val now = _uiState.value as? AuctionDetailUiState.Content ?: current
            if (result.success) {
                // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): o patch otimista
                // partia do `lot` capturado ANTES do round-trip da RPC — se um
                // evento realtime de um lance MAIS ALTO de outro usuário chegasse
                // enquanto aguardávamos a resposta HTTP (caminhos de rede
                // independentes, sem garantia de ordem), esse patch sobrescrevia
                // o estado já correto com o nosso valor antigo, fazendo o usuário
                // se ver como vencedor de um lance que já foi superado. Agora
                // parte do lote MAIS RECENTE (pós-merges de realtime) e só aplica
                // o otimismo se nosso lance ainda for o maior conhecido —
                // nunca regride o estado.
                val latestLot = now.lots.find { it.id == lot.id } ?: now.selectedLot?.takeIf { it.id == lot.id } ?: lot
                if (latestLot.currentBid <= amount) {
                    val optimisticLot = latestLot.copy(currentBid = amount, winnerId = now.myUserId)
                    _uiState.value = now.copy(
                        lots = now.lots.map { if (it.id == lot.id) optimisticLot else it },
                        selectedLot = optimisticLot,
                        pendingBidAmount = null, bidding = false, bidErrorMessage = null
                    )
                } else {
                    // Já fomos superados enquanto a RPC estava em voo — o estado via
                    // realtime já reflete isso corretamente, só limpa o loading.
                    _uiState.value = now.copy(pendingBidAmount = null, bidding = false, bidErrorMessage = null)
                }
            } else {
                _uiState.value = now.copy(bidding = false, pendingBidAmount = null, bidErrorMessage = result.error ?: appContext.getString(R.string.auctions_err_bid_generic))
            }
        }
    }

    private fun setBidError(msg: String) {
        val current = _uiState.value as? AuctionDetailUiState.Content ?: return
        _uiState.value = current.copy(bidErrorMessage = msg)
    }
}
