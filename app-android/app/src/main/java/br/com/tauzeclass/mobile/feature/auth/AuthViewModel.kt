package br.com.tauzeclass.mobile.feature.auth

import android.content.Context
import android.util.Patterns
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.auth.exception.AuthErrorCode
import io.github.jan.supabase.auth.exception.AuthRestException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class AuthLoadingAction { EMAIL, GOOGLE }

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val confirmPassword: String = "",
    val name: String = "",
    val loading: Boolean = false,
    val loadingAction: AuthLoadingAction? = null,
    val errorMessage: String? = null
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    fun onEmailChange(value: String) {
        _uiState.value = _uiState.value.copy(email = value, errorMessage = null)
    }

    fun onPasswordChange(value: String) {
        _uiState.value = _uiState.value.copy(password = value, errorMessage = null)
    }

    fun onConfirmPasswordChange(value: String) {
        _uiState.value = _uiState.value.copy(confirmPassword = value, errorMessage = null)
    }

    fun onNameChange(value: String) {
        _uiState.value = _uiState.value.copy(name = value, errorMessage = null)
    }

    fun login(onSuccess: () -> Unit) {
        val state = _uiState.value
        val validationError = validateEmailPassword(state.email, state.password)
        if (validationError != null) {
            setError(validationError)
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, loadingAction = AuthLoadingAction.EMAIL, errorMessage = null)
            try {
                authRepository.signInWithEmail(state.email.trim(), state.password)
                onSuccess()
            } catch (e: CancellationException) {
                // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): CancellationException
                // estende Exception — sem este catch específico antes, cancelar a
                // corrotina (ex: sair da tela) era engolido em vez de propagar,
                // quebrando o contrato de cooperative cancellation.
                throw e
            } catch (e: Exception) {
                setError(mapAuthError(e))
            } finally {
                _uiState.value = _uiState.value.copy(loading = false, loadingAction = null)
            }
        }
    }

    fun register(onSuccess: () -> Unit) {
        val state = _uiState.value
        val validationError = validateEmailPassword(state.email, state.password)
            ?: if (state.name.trim().length < 3) appContext.getString(R.string.auth_err_name_min) else null
            ?: if (state.password != state.confirmPassword) appContext.getString(R.string.auth_err_password_mismatch) else null
        if (validationError != null) {
            setError(validationError)
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, loadingAction = AuthLoadingAction.EMAIL, errorMessage = null)
            try {
                authRepository.signUpWithEmail(state.email.trim(), state.password, state.name.trim())
                onSuccess()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                setError(mapAuthError(e))
            } finally {
                _uiState.value = _uiState.value.copy(loading = false, loadingAction = null)
            }
        }
    }

    fun signInWithGoogle(result: GoogleSignInResult, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(loading = true, loadingAction = AuthLoadingAction.GOOGLE, errorMessage = null)
            try {
                authRepository.signInWithGoogleIdToken(result.idToken, result.rawNonce)
                onSuccess()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                setError(mapAuthError(e))
            } finally {
                _uiState.value = _uiState.value.copy(loading = false, loadingAction = null)
            }
        }
    }

    fun setGoogleSignInError(message: String) {
        setError(message)
    }

    private fun validateEmailPassword(email: String, password: String): String? = when {
        !Patterns.EMAIL_ADDRESS.matcher(email).matches() -> appContext.getString(R.string.auth_err_invalid_email)
        password.length < 8 -> appContext.getString(R.string.auth_err_password_min)
        else -> null
    }

    private fun setError(message: String) {
        _uiState.value = _uiState.value.copy(errorMessage = message)
    }

    private fun mapAuthError(e: Exception): String {
        val code = (e as? AuthRestException)?.errorCode
        return when (code) {
            AuthErrorCode.InvalidCredentials -> appContext.getString(R.string.auth_err_invalid_credentials)
            AuthErrorCode.EmailExists, AuthErrorCode.UserAlreadyExists -> appContext.getString(R.string.auth_err_email_exists)
            AuthErrorCode.WeakPassword -> appContext.getString(R.string.auth_err_weak_password)
            else -> appContext.getString(R.string.auth_err_unexpected)
        }
    }
}
