package br.com.tauzeclass.mobile.feature.checkout

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.plans.BillingCycle
import br.com.tauzeclass.mobile.feature.plans.Plan
import br.com.tauzeclass.mobile.feature.plans.PlansRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/** Gateways com integração nativa nesta versão — os outros (stripe/mercadopago/asaas) ficam documentados como gap. */
private val SUPPORTED_GATEWAYS = setOf("pagarme")

enum class CheckoutStep { BILLING_FORM, PAYMENT, NATIVE_SWITCH_CONFIRM }

sealed interface CheckoutUiState {
    data object Loading : CheckoutUiState
    data class Error(val message: String) : CheckoutUiState
    data class UnsupportedGateway(val gateway: String) : CheckoutUiState
    data class Content(
        val plan: Plan,
        val billingCycle: BillingCycle,
        val gateway: String,
        val publicKey: String?,
        val currency: String,
        val unitPrice: Double,
        val step: CheckoutStep,
        val name: String = "",
        val doc: String = "",
        val phone: String = "",
        val cep: String = "",
        val street: String = "",
        val number: String = "",
        val neighborhood: String = "",
        val city: String = "",
        val state: String = "",
        val couponCode: String = "",
        val cardHolderName: String = "",
        val cardNumber: String = "",
        val cardExpMonth: String = "",
        val cardExpYear: String = "",
        val cardCvv: String = "",
        val submitting: Boolean = false,
    ) : CheckoutUiState {
        val displayPrice: Double get() = if (billingCycle == BillingCycle.ANNUAL) unitPrice * 0.8 * 12 else unitPrice
        val billingFormValid: Boolean get() {
            val docDigits = doc.filter(Char::isDigit)
            val phoneDigits = phone.filter(Char::isDigit)
            return name.isNotBlank() && (docDigits.length == 11 || docDigits.length == 14) && phoneDigits.length >= 10 &&
                cep.isNotBlank() && street.isNotBlank() && number.isNotBlank() && neighborhood.isNotBlank() && city.isNotBlank() && state.isNotBlank()
        }
        // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): faltava isDigit em
        // mês/ano/CVV (só cardNumber era filtrado) — texto não numérico
        // passava na validação, habilitava o botão "Pagar" e quebrava em
        // NumberFormatException no onSubmitPayment(), mostrando erro técnico
        // cru pro usuário em vez de uma validação apropriada.
        val cardFormValid: Boolean get() =
            cardHolderName.isNotBlank() && cardNumber.filter(Char::isDigit).length in 13..19 &&
                cardExpMonth.all(Char::isDigit) && cardExpMonth.length == 2 &&
                cardExpYear.all(Char::isDigit) && cardExpYear.length == 4 &&
                cardCvv.all(Char::isDigit) && cardCvv.length in 3..4
    }
}

/**
 * Réplica do fluxo de CheckoutModal.tsx, escopo desta versão: só o gateway
 * nacional padrão configurado (Pagar.me, confirmado ao vivo em
 * platform_settings.gateway_nacional_padrao) — os outros 3 gateways
 * (Stripe/MercadoPago/Asaas) exigiriam SDK nativo próprio e ficam
 * documentados como gap. IMPORTANTE: este ViewModel nunca deve enviar
 * cartão nem chamar submitPayment() sem o usuário realmente confirmando
 * uma compra de verdade — as chaves de gateway aqui são de PRODUÇÃO.
 */
@HiltViewModel
class CheckoutViewModel @Inject constructor(
    private val repository: CheckoutRepository,
    private val plansRepository: PlansRepository,
    savedStateHandle: SavedStateHandle,
    @ApplicationContext private val appContext: Context,
) : ViewModel() {
    private val planId: String = checkNotNull(savedStateHandle["planId"])
    private val billingCycle: BillingCycle =
        if (savedStateHandle.get<String>("billingCycle") == "annual") BillingCycle.ANNUAL else BillingCycle.MONTHLY
    private val checkoutId = UUID.randomUUID().toString() // um nonce por ABERTURA da tela, igual ao site (CheckoutModal.tsx)

    private val _uiState = MutableStateFlow<CheckoutUiState>(CheckoutUiState.Loading)
    val uiState: StateFlow<CheckoutUiState> = _uiState.asStateFlow()

    private val _events = MutableSharedFlow<String>()
    val events = _events.asSharedFlow()

    init { load() }
    fun retry() = load()

    private fun load() {
        viewModelScope.launch {
            _uiState.value = CheckoutUiState.Loading
            try {
                val plan = plansRepository.getActivePlans().find { it.id == planId }
                    ?: throw CheckoutException(appContext.getString(R.string.checkout_err_plan_not_found))
                val init = repository.init(planId, billingCycle.apiValue)
                val gateway = init.gateway.orEmpty()
                if (gateway !in SUPPORTED_GATEWAYS) {
                    _uiState.value = CheckoutUiState.UnsupportedGateway(gateway)
                    return@launch
                }
                _uiState.value = CheckoutUiState.Content(
                    plan = plan, billingCycle = billingCycle, gateway = gateway, publicKey = init.publicKey,
                    currency = init.currency ?: "BRL", unitPrice = init.unitPrice ?: plan.monthlyPrice,
                    step = if (init.isNativePlanSwitch) CheckoutStep.NATIVE_SWITCH_CONFIRM else CheckoutStep.BILLING_FORM,
                )
            } catch (e: Exception) {
                _uiState.value = CheckoutUiState.Error(e.message ?: appContext.getString(R.string.checkout_err_init))
            }
        }
    }

    fun onFieldChange(update: (CheckoutUiState.Content) -> CheckoutUiState.Content) {
        val c = _uiState.value as? CheckoutUiState.Content ?: return
        _uiState.value = update(c)
    }

    fun onContinueToPayment() {
        val c = _uiState.value as? CheckoutUiState.Content ?: return
        if (!c.billingFormValid) {
            emit(if (c.doc.filter(Char::isDigit).length !in listOf(11, 14)) appContext.getString(R.string.checkout_err_doc_invalid) else appContext.getString(R.string.checkout_err_required_fields))
            return
        }
        _uiState.value = c.copy(step = CheckoutStep.PAYMENT)
    }

    fun onBackToBilling() {
        val c = _uiState.value as? CheckoutUiState.Content ?: return
        _uiState.value = c.copy(step = CheckoutStep.BILLING_FORM)
    }

    /**
     * Passo final — tokeniza o cartão e efetivamente contrata a assinatura
     * (dinheiro real move aqui). Só deve ser chamado a partir de uma ação
     * explícita do usuário no botão "Pagar", nunca automaticamente.
     */
    fun onSubmitPayment() {
        val c = _uiState.value as? CheckoutUiState.Content ?: return
        if (!c.cardFormValid) { emit(appContext.getString(R.string.checkout_err_card_incomplete)); return }
        val publicKey = c.publicKey ?: run { emit(appContext.getString(R.string.checkout_err_init)); return }

        _uiState.value = c.copy(submitting = true)
        viewModelScope.launch {
            try {
                val gatewayToken = repository.tokenizePagarme(
                    publicKey = publicKey, holderName = c.cardHolderName, number = c.cardNumber.filter(Char::isDigit),
                    expMonth = c.cardExpMonth.filter(Char::isDigit).toInt(), expYear = c.cardExpYear.filter(Char::isDigit).toInt(),
                    cvv = c.cardCvv.filter(Char::isDigit),
                )
                repository.checkout(
                    CheckoutRequest(
                        checkoutId = checkoutId, planId = c.plan.id, billingCycle = c.billingCycle.apiValue,
                        couponCode = c.couponCode.trim().ifBlank { null }, finalPrice = c.displayPrice,
                        billingData = BillingData(c.name, c.doc.filter(Char::isDigit), c.phone.filter(Char::isDigit)),
                        billingAddress = BillingAddress(c.cep.filter(Char::isDigit), c.street, c.number, c.neighborhood, c.city, c.state),
                        gatewayToken = gatewayToken,
                    )
                )
                _events.emit(appContext.getString(R.string.checkout_subscription_confirmed))
                _uiState.value = c.copy(submitting = false)
            } catch (e: Exception) {
                _events.emit(e.message ?: appContext.getString(R.string.auth_err_unexpected))
                _uiState.value = c.copy(submitting = false)
            }
        }
    }

    /** Troca nativa entre 2 planos pagos já configurados no mesmo gateway — sem recoletar cartão/endereço (CheckoutModal.tsx:603). */
    fun onConfirmNativeSwitch() {
        val c = _uiState.value as? CheckoutUiState.Content ?: return
        _uiState.value = c.copy(submitting = true)
        viewModelScope.launch {
            try {
                repository.checkout(
                    CheckoutRequest(
                        checkoutId = checkoutId, planId = c.plan.id, billingCycle = c.billingCycle.apiValue,
                        couponCode = c.couponCode.trim().ifBlank { null }, finalPrice = c.displayPrice,
                    )
                )
                _events.emit(appContext.getString(R.string.checkout_switch_confirmed))
                _uiState.value = c.copy(submitting = false)
            } catch (e: Exception) {
                _events.emit(e.message ?: appContext.getString(R.string.auth_err_unexpected))
                _uiState.value = c.copy(submitting = false)
            }
        }
    }

    private fun emit(msg: String) { viewModelScope.launch { _events.emit(msg) } }
}
