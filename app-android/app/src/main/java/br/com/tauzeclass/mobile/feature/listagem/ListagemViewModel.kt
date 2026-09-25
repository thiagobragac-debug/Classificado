package br.com.tauzeclass.mobile.feature.listagem

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.AdsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed interface ListagemUiState {
    data object Loading : ListagemUiState
    data class Error(val message: String) : ListagemUiState
    data class Content(val result: ListagemResult, val favoriteAdIds: Set<String>) : ListagemUiState
}

@HiltViewModel
class ListagemViewModel @Inject constructor(
    private val repository: ListagemRepository,
    private val adsRepository: AdsRepository,
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _filters = MutableStateFlow(
        ListagemFilters(categoria = savedStateHandle["categoria"], busca = savedStateHandle["busca"] ?: "")
    )
    val filters: StateFlow<ListagemFilters> = _filters.asStateFlow()

    private val _page = MutableStateFlow(1)
    val page: StateFlow<Int> = _page.asStateFlow()

    private val _uiState = MutableStateFlow<ListagemUiState>(ListagemUiState.Loading)
    val uiState: StateFlow<ListagemUiState> = _uiState.asStateFlow()

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _subcategories = MutableStateFlow<List<Subcategory>>(emptyList())
    val subcategories: StateFlow<List<Subcategory>> = _subcategories.asStateFlow()

    private val _countries = MutableStateFlow<List<String>>(emptyList())
    val countries: StateFlow<List<String>> = _countries.asStateFlow()
    private val _states = MutableStateFlow<List<String>>(emptyList())
    val states: StateFlow<List<String>> = _states.asStateFlow()
    private val _cities = MutableStateFlow<List<String>>(emptyList())
    val cities: StateFlow<List<String>> = _cities.asStateFlow()

    private var searchDebounceJob: Job? = null
    private var priceDebounceJob: Job? = null

    init {
        viewModelScope.launch { runCatching { _categories.value = repository.getCategories() } }
        viewModelScope.launch { runCatching { _countries.value = repository.getCountries() } }
        viewModelScope.launch {
            _filters.collectLatest { f ->
                _subcategories.value = f.categoria?.let { runCatching { repository.getSubcategories(it) }.getOrDefault(emptyList()) } ?: emptyList()
            }
        }
        viewModelScope.launch {
            _filters.collectLatest { f ->
                _states.value = f.pais?.takeIf { it != "todos" }
                    ?.let { runCatching { repository.getStates(it, f.categoria) }.getOrDefault(emptyList()) }
                    ?: emptyList()
            }
        }
        viewModelScope.launch {
            _filters.collectLatest { f ->
                _cities.value = if (f.pais != null && f.pais != "todos" && f.estado != null) {
                    runCatching { repository.getCities(f.pais, f.estado, f.categoria) }.getOrDefault(emptyList())
                } else emptyList()
            }
        }
        viewModelScope.launch {
            combine(_filters, _page) { f, p -> f to p }.collectLatest { (f, p) -> load(f, p) }
        }
    }

    private suspend fun load(f: ListagemFilters, p: Int) {
        _uiState.value = ListagemUiState.Loading
        _uiState.value = try {
            val favIds = runCatching { adsRepository.getFavoriteAdIds() }.getOrDefault(emptySet())
            val result = repository.getAdsListagemComFallback(f, p)
            ListagemUiState.Content(result, favIds)
        } catch (e: Exception) {
            ListagemUiState.Error(e.message ?: appContext.getString(R.string.listagem_error_load))
        }
    }

    fun retry() {
        viewModelScope.launch { load(_filters.value, _page.value) }
    }

    fun onCategoriaChange(id: String?) {
        _page.value = 1
        _filters.update { it.copy(categoria = id, subcategorias = emptySet(), finalidade = null) }
    }

    fun onSubcategoriasChange(ids: Set<String>) {
        _page.value = 1
        _filters.update { it.copy(subcategorias = ids) }
    }

    fun onFinalidadeChange(value: String?) {
        _page.value = 1
        _filters.update { it.copy(finalidade = value) }
    }

    fun onBuscaChange(texto: String) {
        searchDebounceJob?.cancel()
        searchDebounceJob = viewModelScope.launch {
            delay(350)
            _page.value = 1
            _filters.update { it.copy(busca = texto) }
        }
    }

    fun onPrecoChange(min: Double?, max: Double?) {
        priceDebounceJob?.cancel()
        priceDebounceJob = viewModelScope.launch {
            delay(400)
            _page.value = 1
            _filters.update { it.copy(precoMin = min, precoMax = max) }
        }
    }

    fun onOrdemChange(ordem: Ordem) {
        _filters.update { it.copy(ordem = ordem) }
    }

    fun onLocalizacaoChange(pais: String?, estado: String?, cidade: String?) {
        _page.value = 1
        _filters.update { it.copy(pais = pais, estado = estado, cidade = cidade) }
    }

    fun onDestaqueToggle(v: Boolean) {
        _page.value = 1
        _filters.update { it.copy(destaque = v) }
    }

    fun onNegociavelToggle(v: Boolean) {
        _page.value = 1
        _filters.update { it.copy(negociavel = v) }
    }

    /** Mesmo comportamento do site (useAdsFilters.clearFilters): reseta TUDO, inclusive categoria e busca. */
    fun onLimparFiltros() {
        _page.value = 1
        _filters.value = ListagemFilters()
    }

    fun onPageChange(novaPagina: Int) {
        _page.value = novaPagina
    }

    fun onFavoriteToggle(adId: String) {
        val current = _uiState.value as? ListagemUiState.Content ?: return
        val wasFavorited = current.favoriteAdIds.contains(adId)
        _uiState.value = current.copy(
            favoriteAdIds = if (wasFavorited) current.favoriteAdIds - adId else current.favoriteAdIds + adId
        )
        viewModelScope.launch {
            try {
                adsRepository.toggleFavorite(adId)
            } catch (e: Exception) {
                val now = _uiState.value as? ListagemUiState.Content ?: return@launch
                _uiState.value = now.copy(
                    favoriteAdIds = if (wasFavorited) now.favoriteAdIds + adId else now.favoriteAdIds - adId
                )
            }
        }
    }
}
