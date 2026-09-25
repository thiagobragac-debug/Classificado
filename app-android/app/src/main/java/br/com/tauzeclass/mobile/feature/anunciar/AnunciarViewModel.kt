package br.com.tauzeclass.mobile.feature.anunciar

import android.content.Context
import android.net.Uri
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.listagem.Category
import br.com.tauzeclass.mobile.feature.listagem.ListagemRepository
import br.com.tauzeclass.mobile.feature.listagem.PurposeOptions
import br.com.tauzeclass.mobile.feature.listagem.Subcategory
import br.com.tauzeclass.mobile.feature.plans.MyPlanLimits
import br.com.tauzeclass.mobile.feature.plans.PlansRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class SaveIndicator { IDLE, SAVING, SAVED }

sealed class AnunciarUiState {
    data object Loading : AnunciarUiState()
    data class Error(val message: String) : AnunciarUiState()
    data class Content(
        val form: AnuncioFormValues = AnuncioFormValues(),
        val step: Int = 0,
        val categories: List<Category> = emptyList(),
        val subcategories: List<Subcategory> = emptyList(),
        val planLimits: MyPlanLimits = MyPlanLimits(),
        val step1Errors: Map<String, String> = emptyMap(),
        val step2Errors: Map<String, String> = emptyMap(),
        val uploadingPhoto: Boolean = false,
        val uploadingVideo: Boolean = false,
        val submitting: Boolean = false,
        val saveIndicator: SaveIndicator = SaveIndicator.IDLE,
        val isEditModeOfPublishedAd: Boolean = false,
        val submitted: Boolean = false,
    ) : AnunciarUiState() {
        val subcategoriaObrigatoria: Boolean get() = subcategories.isNotEmpty()
        val purposeOptions get() = PurposeOptions.byCategory[form.categoria].orEmpty()
    }
}

@HiltViewModel
class AnunciarViewModel @Inject constructor(
    private val repository: AnunciarRepository,
    private val listagemRepository: ListagemRepository,
    private val plansRepository: PlansRepository,
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val adId: String? = savedStateHandle["id"]

    private val _uiState = MutableStateFlow<AnunciarUiState>(AnunciarUiState.Loading)
    val uiState: StateFlow<AnunciarUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<String>()
    val events: SharedFlow<String> = _events

    private var draftId: String? = adId
    private var autosaveJob: Job? = null

    init { load() }

    private fun load() {
        viewModelScope.launch {
            _uiState.value = AnunciarUiState.Loading
            try {
                val categories = listagemRepository.getCategories()
                val planLimits = plansRepository.getMyPlanLimits()
                val editData = if (adId != null) repository.getAdForEdit(adId) else repository.getLatestDraft()
                // Bug real achado ao vivo: sem isto, reabrir "Anunciar" pré-populava o form com o
                // rascunho existente mas draftId ficava null — o autosave seguinte então criava
                // uma linha NOVA em vez de atualizar a existente, duplicando rascunhos a cada sessão.
                draftId = editData?.id
                val form = editData?.toFormValues() ?: AnuncioFormValues()
                val subcategories = form.categoria?.let { runCatching { listagemRepository.getSubcategories(it) }.getOrDefault(emptyList()) }.orEmpty()
                _uiState.value = AnunciarUiState.Content(
                    form = form, categories = categories, subcategories = subcategories, planLimits = planLimits,
                    isEditModeOfPublishedAd = editData != null && editData.status != "draft",
                )
            } catch (e: Exception) {
                _uiState.value = AnunciarUiState.Error(appContext.getString(R.string.anunciar_error_load_form))
            }
        }
    }

    fun retry() = load()

    fun onFormChange(newForm: AnuncioFormValues) {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        _uiState.value = current.copy(form = newForm, step1Errors = emptyMap(), step2Errors = emptyMap())
        scheduleAutosave()
    }

    fun onCategoriaChange(categoryId: String) {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        _uiState.value = current.copy(form = current.form.copy(categoria = categoryId, subcategoria = null, finalidade = null), subcategories = emptyList())
        viewModelScope.launch {
            val subs = runCatching { listagemRepository.getSubcategories(categoryId) }.getOrDefault(emptyList())
            (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(subcategories = subs) }
        }
        scheduleAutosave()
    }

    fun onPaisChange(pais: String) {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        _uiState.value = current.copy(form = current.form.copy(pais = pais, estado = null, cidade = ""))
        scheduleAutosave()
    }

    fun onStepChange(step: Int) {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        if (step > current.step) {
            when (current.step) {
                0 -> {
                    val errors = AnuncioValidation.step1Errors(appContext, current.form, current.subcategoriaObrigatoria)
                    if (errors.isNotEmpty()) { _uiState.value = current.copy(step1Errors = errors); return }
                }
                1 -> {
                    val errors = AnuncioValidation.step2Errors(appContext, current.form)
                    if (errors.isNotEmpty()) { _uiState.value = current.copy(step2Errors = errors); return }
                }
            }
        }
        _uiState.value = current.copy(step = step)
    }

    private fun scheduleAutosave() {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        if (current.isEditModeOfPublishedAd) return // nunca sobrescreve um anúncio já publicado com status=draft
        autosaveJob?.cancel()
        autosaveJob = viewModelScope.launch {
            delay(1500)
            val state = _uiState.value as? AnunciarUiState.Content ?: return@launch
            val form = state.form
            if (form.titulo.trim().length <= 3 || form.categoria.isNullOrBlank()) return@launch
            _uiState.value = state.copy(saveIndicator = SaveIndicator.SAVING)
            try {
                val payload = buildAdPayload(form, status = "draft")
                draftId = if (draftId != null) {
                    repository.updateAd(draftId!!, payload); draftId
                } else {
                    repository.createAd(payload)
                }
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(saveIndicator = SaveIndicator.SAVED) }
            } catch (e: PostgrestRestException) {
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(saveIndicator = SaveIndicator.IDLE) }
                if (e.code == "403" || e.code == "42501" || e.message?.contains("RLS") == true) {
                    draftId = null
                    _events.emit(appContext.getString(R.string.anunciar_error_session_draft))
                } else {
                    _events.emit(appContext.getString(R.string.anunciar_error_save_draft))
                }
            } catch (e: Exception) {
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(saveIndicator = SaveIndicator.IDLE) }
                _events.emit(appContext.getString(R.string.anunciar_error_save_draft))
            }
        }
    }

    fun onPhotoPicked(context: Context, uri: Uri) {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        if (current.form.fotos.size >= current.planLimits.maxPhotos) {
            viewModelScope.launch { _events.emit(context.getString(R.string.anunciar_error_photo_limit, current.planLimits.maxPhotos)) }
            return
        }
        viewModelScope.launch {
            _uiState.value = current.copy(uploadingPhoto = true)
            try {
                val url = repository.uploadPhoto(context, uri)
                val latest = _uiState.value as? AnunciarUiState.Content ?: return@launch
                onFormChange(latest.form.copy(fotos = latest.form.fotos + url))
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(uploadingPhoto = false) }
            } catch (e: Exception) {
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(uploadingPhoto = false) }
                _events.emit(e.message ?: context.getString(R.string.anunciar_error_upload_photo))
            }
        }
    }

    fun onPhotoRemoved(url: String) {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        onFormChange(current.form.copy(fotos = current.form.fotos - url))
    }

    fun onVideoPicked(context: Context, uri: Uri) {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        if (!current.planLimits.hasVideo) {
            viewModelScope.launch { _events.emit(context.getString(R.string.anunciar_error_video_plan)) }
            return
        }
        viewModelScope.launch {
            _uiState.value = current.copy(uploadingVideo = true)
            try {
                val url = repository.uploadVideo(context, uri)
                val latest = _uiState.value as? AnunciarUiState.Content ?: return@launch
                onFormChange(latest.form.copy(video = url))
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(uploadingVideo = false) }
            } catch (e: Exception) {
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(uploadingVideo = false) }
                _events.emit(e.message ?: context.getString(R.string.anunciar_error_upload_video))
            }
        }
    }

    fun onVideoRemoved() {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        onFormChange(current.form.copy(video = null))
    }

    fun onSubmit() {
        val current = _uiState.value as? AnunciarUiState.Content ?: return
        val step1Errors = AnuncioValidation.step1Errors(appContext, current.form, current.subcategoriaObrigatoria)
        val step2Errors = AnuncioValidation.step2Errors(appContext, current.form)
        if (step1Errors.isNotEmpty()) { _uiState.value = current.copy(step = 0, step1Errors = step1Errors); return }
        if (step2Errors.isNotEmpty()) { _uiState.value = current.copy(step = 1, step2Errors = step2Errors); return }

        autosaveJob?.cancel()
        viewModelScope.launch {
            _uiState.value = current.copy(submitting = true)
            try {
                val payload = buildAdPayload(current.form, status = "pending")
                if (draftId != null) repository.updateAd(draftId!!, payload) else draftId = repository.createAd(payload)
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(submitting = false, submitted = true) }
                _events.emit(
                    if (current.isEditModeOfPublishedAd) appContext.getString(R.string.anunciar_updated_pending_review)
                    else appContext.getString(R.string.anunciar_submitted_for_review)
                )
            } catch (e: Exception) {
                (_uiState.value as? AnunciarUiState.Content)?.let { _uiState.value = it.copy(submitting = false) }
                _events.emit(appContext.getString(R.string.anunciar_error_publish))
            }
        }
    }
}
