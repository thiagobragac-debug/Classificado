package br.com.tauzeclass.mobile.feature.plans

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlansScreen(onBackClick: () -> Unit, onSubscribeClick: (Plan, BillingCycle) -> Unit, viewModel: PlansViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(stringResource(R.string.plans_title)) },
            navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
        )
    }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val state = uiState) {
                PlansUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                is PlansUiState.Error -> ErrorState(state.message, viewModel::retry)
                is PlansUiState.Content -> PlansContent(state, viewModel::onBillingCycleChange, onSubscribeClick)
            }
        }
    }
}

@Composable
private fun PlansContent(state: PlansUiState.Content, onCycleChange: (BillingCycle) -> Unit, onSubscribeClick: (Plan, BillingCycle) -> Unit) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(TcSpacing.sp4)) {
        item {
            Text(
                stringResource(R.string.plans_subtitle),
                style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted
            )
            Spacer(Modifier.height(TcSpacing.sp4))
            CycleToggle(state.billingCycle, onCycleChange)
            Spacer(Modifier.height(TcSpacing.sp5))
        }
        items(state.plans, key = { it.id }) { plan ->
            val isCurrent = state.currentPlanId == plan.id || (state.currentPlanId == null && plan.isFree)
            PlanCard(plan, state.billingCycle, isCurrent, state.useUsd, onSubscribeClick = { onSubscribeClick(plan, state.billingCycle) })
            Spacer(Modifier.height(TcSpacing.sp4))
        }
    }
}

@Composable
private fun CycleToggle(selected: BillingCycle, onChange: (BillingCycle) -> Unit) {
    Row(Modifier.fillMaxWidth().background(TcColors.BgAlt, TcShape.Pill).padding(4.dp)) {
        CycleToggleTab(stringResource(R.string.plans_cycle_monthly), selected == BillingCycle.MONTHLY, { onChange(BillingCycle.MONTHLY) }, Modifier.weight(1f))
        CycleToggleTab(stringResource(R.string.plans_cycle_annual), selected == BillingCycle.ANNUAL, { onChange(BillingCycle.ANNUAL) }, Modifier.weight(1f))
    }
}

@Composable
private fun CycleToggleTab(label: String, active: Boolean, onClick: () -> Unit, modifier: Modifier) {
    Box(
        modifier.clip(TcShape.Pill)
            .background(if (active) TcColors.Surface else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, style = MaterialTheme.typography.labelLarge.copy(fontWeight = if (active) FontWeight.Bold else FontWeight.Normal), color = if (active) TcColors.Primary else TcColors.TextMuted)
    }
}

@Composable
private fun PlanCard(plan: Plan, cycle: BillingCycle, isCurrent: Boolean, useUsd: Boolean, onSubscribeClick: () -> Unit) {
    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): igual ao site, troca pra
    // USD (quando o plano tem price_usd e o geoip indica visitante fora do
    // Brasil) em vez de sempre mostrar BRL.
    val displayPrice = if (cycle == BillingCycle.ANNUAL) plan.displayAnnualPrice(useUsd) else plan.displayPrice(useUsd)
    val displayCurrency = plan.displayCurrency(useUsd)
    val isPopular = plan.sortOrder == 2

    Column(
        Modifier.fillMaxWidth().background(TcColors.Surface, TcShape.AdCard)
            .border(if (isPopular) 2.dp else 1.dp, if (isPopular) TcColors.Accent else TcColors.Border, TcShape.AdCard)
            .padding(TcSpacing.sp5)
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("${plan.icon.orEmpty()} ${plan.name}", style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
            if (isPopular) {
                Box(Modifier.background(TcColors.Accent, TcShape.Pill).padding(horizontal = 10.dp, vertical = 4.dp)) {
                    Text(stringResource(R.string.plans_badge_popular), color = Color.White, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
                }
            }
        }
        Spacer(Modifier.height(TcSpacing.sp2))
        plan.description?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted) }
        Spacer(Modifier.height(TcSpacing.sp3))

        if (plan.isFree) {
            Text(stringResource(R.string.plans_free), style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold), color = TcColors.Text)
        } else {
            Row(verticalAlignment = Alignment.Bottom) {
                Text(formatPrice(displayPrice, displayCurrency), style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.ExtraBold), color = TcColors.Text)
                Text(if (cycle == BillingCycle.ANNUAL) stringResource(R.string.plans_per_year) else stringResource(R.string.plans_per_month), style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted, modifier = Modifier.padding(start = 4.dp, bottom = 4.dp))
            }
        }
        Spacer(Modifier.height(TcSpacing.sp4))

        plan.features.forEach { feature ->
            Row(Modifier.padding(vertical = 3.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.Check, contentDescription = null, tint = TcColors.Primary, modifier = Modifier.width(18.dp).padding(top = 2.dp))
                Spacer(Modifier.width(TcSpacing.sp2))
                Text(feature, style = MaterialTheme.typography.bodySmall, color = TcColors.Text)
            }
        }
        Spacer(Modifier.height(TcSpacing.sp5))

        when {
            isCurrent -> OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.plans_current_plan_badge)) }
            plan.isFree -> OutlinedButton(onClick = {}, enabled = false, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.plans_coming_soon)) }
            else -> GradientButton(
                text = stringResource(R.string.plans_subscribe), onClick = onSubscribeClick,
                gradient = TcGradient.Primary, shadowLayers = TcShadow.Green, modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
