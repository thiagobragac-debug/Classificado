package br.com.tauzeclass.mobile.feature.profile

import android.content.Context
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.auth.AuthRepository
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

sealed class ProfileUiState {
    data object Loading : ProfileUiState()
    data class Error(val message: String) : ProfileUiState()
    data class Content(
        val form: ProfileFormValues,
        val avatarUrl: String? = null,
        val bannerUrl: String? = null,
        val hasBannerPlan: Boolean = false,
        val kycStatus: String? = null,
        val emailVerified: Boolean = false,
        val phoneVerified: Boolean = false,
        val saving: Boolean = false,
        val uploadingAvatar: Boolean = false,
        val uploadingBanner: Boolean = false,
    ) : ProfileUiState()
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: ProfileRepository,
    private val authRepository: AuthRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<String>()
    val events: SharedFlow<String> = _events

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.value = ProfileUiState.Loading
            _uiState.value = try {
                val myProfile = repository.getMyProfile()
                ProfileUiState.Content(
                    form = ProfileFormValues.fromProfile(myProfile.profile, myProfile.secrets),
                    avatarUrl = myProfile.profile.avatarUrl,
                    bannerUrl = myProfile.profile.bannerUrl,
                    hasBannerPlan = repository.hasBannerPlan(),
                    kycStatus = myProfile.profile.kycStatus,
                    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): profile.emailVerified
                    // é coluna morta, sempre false — usar o Supabase Auth de verdade
                    // (mesmo fix já aplicado no site).
                    emailVerified = authRepository.isEmailConfirmed(),
                    phoneVerified = myProfile.profile.phoneVerified || myProfile.secrets.phoneWhatsapp?.isNotBlank() == true,
                )
            } catch (e: Exception) {
                ProfileUiState.Error(appContext.getString(R.string.profile_error_load))
            }
        }
    }

    fun onLogout() {
        viewModelScope.launch { authRepository.signOut() } // sessionStatus muda sozinho via StateFlow, RootScreen reage
    }

    fun onFormChange(form: ProfileFormValues) {
        (_uiState.value as? ProfileUiState.Content)?.let { _uiState.value = it.copy(form = form) }
    }

    fun onSave() {
        val current = _uiState.value as? ProfileUiState.Content ?: return
        if (current.form.name.trim().length < 2) {
            viewModelScope.launch { _events.emit(appContext.getString(R.string.profile_err_name_min)) }
            return
        }
        viewModelScope.launch {
            _uiState.value = current.copy(saving = true)
            try {
                repository.updateProfile(current.form.toPayloadMap())
                _events.emit(appContext.getString(R.string.profile_save_success))
                load()
            } catch (e: PostgrestRestException) {
                _uiState.value = current.copy(saving = false)
                if (e.code == "23505") _events.emit(appContext.getString(R.string.profile_err_doc_exists))
                else _events.emit(appContext.getString(R.string.profile_err_save))
            } catch (e: Exception) {
                _uiState.value = current.copy(saving = false)
                _events.emit(appContext.getString(R.string.profile_err_save))
            }
        }
    }

    fun onAvatarPicked(context: Context, uri: Uri) {
        val current = _uiState.value as? ProfileUiState.Content ?: return
        viewModelScope.launch {
            _uiState.value = current.copy(uploadingAvatar = true)
            try {
                val url = repository.uploadAvatar(context, uri)
                _uiState.value = (_uiState.value as? ProfileUiState.Content)?.copy(avatarUrl = url, uploadingAvatar = false) ?: _uiState.value
            } catch (e: Exception) {
                _uiState.value = (_uiState.value as? ProfileUiState.Content)?.copy(uploadingAvatar = false) ?: _uiState.value
                _events.emit(appContext.getString(R.string.anunciar_error_upload_photo))
            }
        }
    }

    fun onBannerPicked(context: Context, uri: Uri) {
        val current = _uiState.value as? ProfileUiState.Content ?: return
        viewModelScope.launch {
            _uiState.value = current.copy(uploadingBanner = true)
            try {
                val url = repository.uploadBanner(context, uri)
                _uiState.value = (_uiState.value as? ProfileUiState.Content)?.copy(bannerUrl = url, uploadingBanner = false) ?: _uiState.value
            } catch (e: Exception) {
                _uiState.value = (_uiState.value as? ProfileUiState.Content)?.copy(uploadingBanner = false) ?: _uiState.value
                _events.emit(e.message ?: appContext.getString(R.string.profile_err_upload_banner))
            }
        }
    }
}
