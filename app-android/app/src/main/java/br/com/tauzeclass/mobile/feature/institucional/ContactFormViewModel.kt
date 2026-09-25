package br.com.tauzeclass.mobile.feature.institucional

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ContactFormViewModel @Inject constructor(
    private val contactService: ContactService,
    @ApplicationContext private val appContext: Context
) : ViewModel() {
    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _events = MutableSharedFlow<String>()
    val events: SharedFlow<String> = _events

    fun send(name: String, email: String, phone: String?, subject: String, message: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _sending.value = true
            when (val outcome = contactService.send(ContactRequest(name, email, phone, subject, message))) {
                ContactOutcome.Success -> {
                    _events.emit(appContext.getString(R.string.institucional_send_success))
                    onSuccess()
                }
                is ContactOutcome.Failure -> _events.emit(outcome.message)
            }
            _sending.value = false
        }
    }
}
