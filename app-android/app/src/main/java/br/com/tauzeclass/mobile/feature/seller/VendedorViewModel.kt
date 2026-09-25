package br.com.tauzeclass.mobile.feature.seller

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.AdsRepository
import br.com.tauzeclass.mobile.feature.listagem.ListagemFilters
import br.com.tauzeclass.mobile.feature.listagem.ListagemRepository
import br.com.tauzeclass.mobile.feature.listagem.ListagemResult
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ReviewDialogState(
    val visible: Boolean = false,
    val rating: Int = 5,
    val comment: String = "",
    val submitting: Boolean = false,
    val errorMessage: String? = null,
    val success: Boolean = false,
)

sealed interface VendedorUiState {
    data object Loading : VendedorUiState
    data object NotFound : VendedorUiState
    data class Error(val message: String) : VendedorUiState
    data class Content(
        val profile: SellerProfile,
        val stats: SellerStats,
        val ads: ListagemResult,
        val page: Int,
        val favoriteAdIds: Set<String> = emptySet(),
        val review: ReviewDialogState = ReviewDialogState(),
    ) : VendedorUiState
}

@HiltViewModel
class VendedorViewModel @Inject constructor(
    private val sellerRepository: SellerRepository,
    private val listagemRepository: ListagemRepository,
    private val adsRepository: AdsRepository,
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context,
    savedStateHandle: SavedStateHandle
) : ViewModel() {
    private val slugOrId: String = checkNotNull(savedStateHandle["slug"])

    private val _uiState = MutableStateFlow<VendedorUiState>(VendedorUiState.Loading)
    val uiState: StateFlow<VendedorUiState> = _uiState.asStateFlow()

    init { load(page = 1) }

    fun retry() = load(page = 1)

    private fun load(page: Int) {
        viewModelScope.launch {
            _uiState.value = VendedorUiState.Loading
            try {
                val profile = sellerRepository.resolveProfile(slugOrId)
                if (profile == null) {
                    _uiState.value = VendedorUiState.NotFound
                    return@launch
                }

                val stats = runCatching { sellerRepository.getSellerStats(profile.id) }.getOrDefault(SellerStats())
                val favIds = runCatching { adsRepository.getFavoriteAdIds() }.getOrDefault(emptySet())
                // Sem fallback geográfico de propósito (mesma decisão do site: disableAutoGeo quando há sellerId).
                val ads = listagemRepository.getAdsListagem(ListagemFilters(vendedorId = profile.id), page)

                _uiState.value = VendedorUiState.Content(profile, stats, ads, page, favIds)
            } catch (e: Exception) {
                _uiState.value = VendedorUiState.Error(appContext.getString(R.string.seller_error_load))
            }
        }
    }

    fun onPageChange(page: Int) = load(page)

    fun onFavoriteToggle(adId: String) {
        val current = _uiState.value as? VendedorUiState.Content ?: return
        val was = current.favoriteAdIds.contains(adId)
        _uiState.value = current.copy(favoriteAdIds = if (was) current.favoriteAdIds - adId else current.favoriteAdIds + adId)
        viewModelScope.launch {
            runCatching { adsRepository.toggleFavorite(adId) }.onFailure {
                (_uiState.value as? VendedorUiState.Content)?.let { now ->
                    _uiState.value = now.copy(favoriteAdIds = if (was) now.favoriteAdIds + adId else now.favoriteAdIds - adId)
                }
            }
        }
    }

    // --- Modal de avaliação ---
    fun onOpenReview() = updateReview { it.copy(visible = true, errorMessage = null, success = false) }
    fun onDismissReview() = updateReview { ReviewDialogState() }
    fun onRatingChange(rating: Int) = updateReview { it.copy(rating = rating) }
    fun onCommentChange(comment: String) = updateReview { it.copy(comment = comment.take(500)) }

    fun onSubmitReview() {
        val current = _uiState.value as? VendedorUiState.Content ?: return
        val userId = supabase.auth.currentUserOrNull()?.id
        if (userId == null) {
            updateReview { it.copy(errorMessage = appContext.getString(R.string.seller_err_login_required)) }
            return
        }
        viewModelScope.launch {
            updateReview { it.copy(submitting = true, errorMessage = null) }
            try {
                sellerRepository.submitReview(current.profile.id, userId, current.review.rating, current.review.comment)
                updateReview { it.copy(submitting = false, success = true, visible = false) }
                load(current.page) // refaz get_seller_stats, mesmo efeito do router.refresh() do site
            } catch (e: Exception) {
                val msg = e.message.orEmpty()
                val friendly = when {
                    msg.contains("nao_autoavaliar") -> appContext.getString(R.string.seller_err_self_review)
                    msg.contains("duplicate") || msg.contains("par_unico") -> appContext.getString(R.string.seller_err_already_reviewed)
                    else -> appContext.getString(R.string.seller_err_review_generic)
                }
                updateReview { it.copy(submitting = false, errorMessage = friendly) }
            }
        }
    }

    private inline fun updateReview(transform: (ReviewDialogState) -> ReviewDialogState) {
        val current = _uiState.value as? VendedorUiState.Content ?: return
        _uiState.value = current.copy(review = transform(current.review))
    }
}
