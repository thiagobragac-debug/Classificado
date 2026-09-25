package br.com.tauzeclass.mobile.feature.checkout

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class CheckoutInitRequest(
    @SerialName("planId") val planId: String,
    @SerialName("billingCycle") val billingCycle: String,
)

@Serializable
data class CheckoutInitResponse(
    val gateway: String? = null,
    val publicKey: String? = null,
    val clientSecret: String? = null,
    val isNativePlanSwitch: Boolean = false,
    val currency: String? = null,
    val unitPrice: Double? = null,
    val error: String? = null,
)

@Serializable
data class BillingData(val name: String, val doc: String, val phone: String)

@Serializable
data class BillingAddress(
    val cep: String,
    val street: String,
    val number: String,
    val neighborhood: String,
    val city: String,
    val state: String,
)

@Serializable
data class CheckoutRequest(
    val checkoutId: String,
    val planId: String,
    val billingCycle: String,
    val paymentMethod: String = "card",
    val couponCode: String? = null,
    val finalPrice: Double,
    val billingData: BillingData? = null,
    val billingAddress: BillingAddress? = null,
    // Ausente (não string vazia) na troca nativa entre planos pagos já configurados — CheckoutModal.tsx:603 chama handleServerCheckout({}).
    val gatewayToken: String? = null,
)

@Serializable
data class CheckoutResponse(
    val success: Boolean = false,
    val checkoutUrl: String? = null,
    val gateway: String? = null,
    val sessionId: String? = null,
    val planSwitch: Boolean = false,
    val error: String? = null,
)

/** POST direto contra a API da Pagar.me (nunca passa pelo nosso servidor) — igual a CheckoutModal.tsx::handlePagarmeCardSubmit. */
@Serializable
data class PagarmeCard(
    val number: String,
    @SerialName("holder_name") val holderName: String,
    @SerialName("exp_month") val expMonth: Int,
    @SerialName("exp_year") val expYear: Int,
    val cvv: String,
)

@Serializable
data class PagarmeTokenRequest(val type: String = "card", val card: PagarmeCard)

@Serializable
data class PagarmeTokenResponse(val id: String? = null, val message: String? = null)
