package br.com.tauzeclass.mobile.feature.checkout

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.formatPrice
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(onBackClick: () -> Unit, viewModel: CheckoutViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel) {
        viewModel.events.collect { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.checkout_title)) },
                navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val state = uiState) {
                CheckoutUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                is CheckoutUiState.Error -> ErrorState(state.message, viewModel::retry)
                is CheckoutUiState.UnsupportedGateway -> UnsupportedGatewayState(state.gateway)
                is CheckoutUiState.Content -> CheckoutContent(state, viewModel)
            }
        }
    }
}

@Composable
private fun UnsupportedGatewayState(gateway: String) {
    Column(
        Modifier.fillMaxSize().padding(TcSpacing.sp8), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Filled.Lock, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.width(40.dp))
        Spacer(Modifier.height(TcSpacing.sp3))
        Text(
            stringResource(R.string.checkout_unsupported_gateway, gateway.ifBlank { stringResource(R.string.checkout_gateway_unknown) }),
            style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted
        )
    }
}

@Composable
private fun CheckoutContent(state: CheckoutUiState.Content, viewModel: CheckoutViewModel) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(TcSpacing.sp4)) {
        PlanSummaryCard(state)
        Spacer(Modifier.height(TcSpacing.sp5))

        when (state.step) {
            CheckoutStep.NATIVE_SWITCH_CONFIRM -> NativeSwitchConfirmStep(state, viewModel)
            CheckoutStep.BILLING_FORM -> BillingFormStep(state, viewModel)
            CheckoutStep.PAYMENT -> PaymentStep(state, viewModel)
        }

        Spacer(Modifier.height(TcSpacing.sp5))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
            Text(stringResource(R.string.checkout_badge_ssl), style = MaterialTheme.typography.labelSmall, color = TcColors.TextLight)
            Spacer(Modifier.width(TcSpacing.sp3))
            Text(stringResource(R.string.checkout_badge_pci), style = MaterialTheme.typography.labelSmall, color = TcColors.TextLight)
            Spacer(Modifier.width(TcSpacing.sp3))
            Text(stringResource(R.string.checkout_badge_secure), style = MaterialTheme.typography.labelSmall, color = TcColors.TextLight)
        }
    }
}

@Composable
private fun PlanSummaryCard(state: CheckoutUiState.Content) {
    Column(Modifier.fillMaxWidth().background(TcColors.BgAlt, TcShape.CategoryCard).padding(TcSpacing.sp4)) {
        Text(
            stringResource(R.string.checkout_plan_summary, state.plan.name) + if (state.billingCycle == br.com.tauzeclass.mobile.feature.plans.BillingCycle.ANNUAL) stringResource(R.string.checkout_annual_suffix) else "",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
        )
        Spacer(Modifier.height(TcSpacing.sp1))
        Text(
            formatPrice(state.displayPrice, state.currency) + if (state.billingCycle == br.com.tauzeclass.mobile.feature.plans.BillingCycle.ANNUAL) stringResource(R.string.plans_per_year) else stringResource(R.string.plans_per_month),
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold), color = TcColors.Primary
        )
    }
}

@Composable
private fun NativeSwitchConfirmStep(state: CheckoutUiState.Content, viewModel: CheckoutViewModel) {
    Column {
        Text(stringResource(R.string.checkout_confirm_switch_title), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        Spacer(Modifier.height(TcSpacing.sp2))
        Text(
            stringResource(R.string.checkout_confirm_switch_desc),
            style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted
        )
        Spacer(Modifier.height(TcSpacing.sp5))
        GradientButton(
            text = if (state.submitting) stringResource(R.string.checkout_processing) else stringResource(R.string.checkout_confirm_switch_button), onClick = viewModel::onConfirmNativeSwitch,
            gradient = TcGradient.Primary, shadowLayers = TcShadow.Green, loading = state.submitting, modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun BillingFormStep(state: CheckoutUiState.Content, viewModel: CheckoutViewModel) {
    Column {
        Text(stringResource(R.string.checkout_billing_intro), style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted)
        Spacer(Modifier.height(TcSpacing.sp4))

        LabeledField(stringResource(R.string.auth_name), state.name) { v -> viewModel.onFieldChange { it.copy(name = v) } }
        LabeledField(stringResource(R.string.profile_field_document), state.doc) { v -> viewModel.onFieldChange { it.copy(doc = v) } }
        LabeledField(stringResource(R.string.checkout_phone), state.phone) { v -> viewModel.onFieldChange { it.copy(phone = v) } }

        Spacer(Modifier.height(TcSpacing.sp4))
        Text(stringResource(R.string.checkout_billing_address), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
        Spacer(Modifier.height(TcSpacing.sp2))
        LabeledField(stringResource(R.string.profile_field_zip), state.cep) { v -> viewModel.onFieldChange { it.copy(cep = v) } }
        LabeledField(stringResource(R.string.checkout_street), state.street) { v -> viewModel.onFieldChange { it.copy(street = v) } }
        Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
            Box(Modifier.weight(1f)) { LabeledField(stringResource(R.string.profile_field_number), state.number) { v -> viewModel.onFieldChange { it.copy(number = v) } } }
            Box(Modifier.weight(2f)) { LabeledField(stringResource(R.string.profile_field_neighborhood), state.neighborhood) { v -> viewModel.onFieldChange { it.copy(neighborhood = v) } } }
        }
        LabeledField(stringResource(R.string.listagem_city), state.city) { v -> viewModel.onFieldChange { it.copy(city = v) } }
        LabeledField(stringResource(R.string.checkout_state_uf), state.state) { v -> viewModel.onFieldChange { it.copy(state = v) } }

        Spacer(Modifier.height(TcSpacing.sp4))
        LabeledField(stringResource(R.string.checkout_coupon_code), state.couponCode) { v -> viewModel.onFieldChange { it.copy(couponCode = v) } }

        Spacer(Modifier.height(TcSpacing.sp5))
        GradientButton(
            text = stringResource(R.string.checkout_continue_to_payment), onClick = viewModel::onContinueToPayment,
            gradient = TcGradient.Primary, shadowLayers = TcShadow.Green, modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun PaymentStep(state: CheckoutUiState.Content, viewModel: CheckoutViewModel) {
    Column {
        Text(stringResource(R.string.checkout_card_section), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold))
        Spacer(Modifier.height(TcSpacing.sp4))

        LabeledField(stringResource(R.string.checkout_card_holder), state.cardHolderName) { v -> viewModel.onFieldChange { it.copy(cardHolderName = v) } }
        LabeledField(stringResource(R.string.checkout_card_number), state.cardNumber) { v -> viewModel.onFieldChange { it.copy(cardNumber = v) } }
        Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
            Box(Modifier.weight(1f)) { LabeledField(stringResource(R.string.checkout_card_exp_month), state.cardExpMonth) { v -> viewModel.onFieldChange { it.copy(cardExpMonth = v) } } }
            Box(Modifier.weight(1f)) { LabeledField(stringResource(R.string.checkout_card_exp_year), state.cardExpYear) { v -> viewModel.onFieldChange { it.copy(cardExpYear = v) } } }
            Box(Modifier.weight(1f)) { LabeledField(stringResource(R.string.checkout_card_cvv), state.cardCvv) { v -> viewModel.onFieldChange { it.copy(cardCvv = v) } } }
        }

        Spacer(Modifier.height(TcSpacing.sp5))
        GradientButton(
            text = if (state.submitting) stringResource(R.string.checkout_tokenizing_card) else stringResource(R.string.checkout_pay_with_card), onClick = viewModel::onSubmitPayment,
            gradient = TcGradient.Primary, shadowLayers = TcShadow.Green, enabled = state.cardFormValid, loading = state.submitting,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(TcSpacing.sp2))
        OutlinedButton(onClick = viewModel::onBackToBilling, modifier = Modifier.fillMaxWidth()) { Text("← " + stringResource(R.string.common_back)) }
    }
}

@Composable
private fun LabeledField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = onValueChange, label = { Text(label) },
        singleLine = true, shape = TcShape.Input, modifier = Modifier.fillMaxWidth().padding(vertical = TcSpacing.sp1)
    )
}
