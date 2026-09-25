package br.com.tauzeclass.mobile.feature.kyc

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

sealed interface KycUiState {
    data object Loading : KycUiState
    data class Error(val message: String) : KycUiState
    data class Content(
        val verified: Boolean,
        val requestStatus: String? = null,
        val showManualForm: Boolean = false,
        val cpfCnpj: String = "",
        val docFrontUri: Uri? = null,
        val docBackUri: Uri? = null,
        val selfieUri: Uri? = null,
        val uploading: Boolean = false,
    ) : KycUiState {
        val docType: KycDocType get() = KycDocType.fromDigits(cpfCnpj.filter(Char::isDigit))
        val canSubmit: Boolean get() = !uploading && cpfCnpj.isNotBlank() && docFrontUri != null && docBackUri != null && selfieUri != null
    }
}

/** Réplica 1:1 do estado de VerificacaoClient.tsx (checkUser/handleManualSubmit). */
@HiltViewModel
class KycViewModel @Inject constructor(
    private val repository: KycRepository,
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<KycUiState>(KycUiState.Loading)
    val uiState: StateFlow<KycUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<String>()
    val events = _events.asSharedFlow()

    private fun uid() = supabase.auth.currentUserOrNull()?.id ?: error(appContext.getString(R.string.common_session_not_found))
    private fun current() = _uiState.value as? KycUiState.Content
    private fun emit(msg: String) { viewModelScope.launch { _events.emit(msg) } }

    init { load() }
    fun retry() = load()

    fun load() {
        viewModelScope.launch {
            _uiState.value = KycUiState.Loading
            try {
                val userId = uid()
                val (verified, _) = repository.getProfileVerification(userId)
                val requestStatus = runCatching { repository.getLatestRequestStatus(userId) }.getOrNull()
                _uiState.value = KycUiState.Content(verified = verified, requestStatus = requestStatus)
            } catch (e: Exception) {
                _uiState.value = KycUiState.Error(appContext.getString(R.string.kyc_error_load))
            }
        }
    }

    fun onToggleManualForm() {
        val c = current() ?: return
        _uiState.value = c.copy(showManualForm = !c.showManualForm)
    }

    /** Gov.br não existe de verdade (nem no site) — só avisa e expande o envio manual. */
    fun onGovBrClick() {
        val c = current() ?: return
        _uiState.value = c.copy(showManualForm = true)
        emit(appContext.getString(R.string.kyc_govbr_toast))
    }

    fun onCpfCnpjChange(value: String) {
        val c = current() ?: return
        if (value.length <= 18) _uiState.value = c.copy(cpfCnpj = value)
    }

    fun onFrontPicked(context: Context, uri: Uri) = onFilePicked(context, uri) { c, valid -> c.copy(docFrontUri = valid) }
    fun onBackPicked(context: Context, uri: Uri) = onFilePicked(context, uri) { c, valid -> c.copy(docBackUri = valid) }
    fun onSelfiePicked(context: Context, uri: Uri) = onFilePicked(context, uri) { c, valid -> c.copy(selfieUri = valid) }

    private fun onFilePicked(context: Context, uri: Uri, apply: (KycUiState.Content, Uri) -> KycUiState.Content) {
        val c = current() ?: return
        viewModelScope.launch {
            when (withContext(Dispatchers.IO) { repository.validateFile(context, uri) }) {
                KycFileError.INVALID_TYPE -> _events.emit(appContext.getString(R.string.kyc_err_file_type))
                KycFileError.TOO_LARGE -> _events.emit(appContext.getString(R.string.kyc_err_file_size))
                null -> (current() ?: c).let { _uiState.value = apply(it, uri) }
            }
        }
    }

    fun onSubmit(context: Context) {
        val c = current() ?: return
        if (c.cpfCnpj.isBlank()) { emit(appContext.getString(R.string.kyc_err_fill_document)); return }
        val front = c.docFrontUri
        val back = c.docBackUri
        val selfie = c.selfieUri
        if (front == null || back == null || selfie == null) { emit(appContext.getString(R.string.kyc_err_attach_3)); return }

        _uiState.value = c.copy(uploading = true)
        viewModelScope.launch {
            try {
                val userId = uid()
                val frontPath = repository.uploadDocument(context, userId, front, "front")
                val backPath = repository.uploadDocument(context, userId, back, "back")
                val selfiePath = repository.uploadDocument(context, userId, selfie, "selfie")
                val digits = c.cpfCnpj.filter(Char::isDigit)
                repository.submit(userId, frontPath, backPath, selfiePath, digits, KycDocType.fromDigits(digits))
                _events.emit(appContext.getString(R.string.kyc_send_success))
                _uiState.value = KycUiState.Content(
                    verified = c.verified, requestStatus = "pending", showManualForm = false,
                )
            } catch (e: Exception) {
                _events.emit(appContext.getString(R.string.kyc_send_error))
                _uiState.value = (current() ?: c).copy(uploading = false)
            }
        }
    }
}
