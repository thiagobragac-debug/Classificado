package br.com.tauzeclass.mobile.feature.profile

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.LocaleManager
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.components.VerifiedBadge
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch

@Composable
fun ProfileTab(
    onInstitucionalClick: () -> Unit,
    onVerificarIdentidadeClick: () -> Unit,
    onPlanosClick: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel) {
        viewModel.events.collect { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
    }

    Box(Modifier.fillMaxSize()) {
        when (val state = uiState) {
            ProfileUiState.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = TcColors.Primary) }
            is ProfileUiState.Error -> ErrorState(state.message, viewModel::load)
            is ProfileUiState.Content -> ProfileForm(state, viewModel, onInstitucionalClick, onVerificarIdentidadeClick, onPlanosClick)
        }
        SnackbarHost(hostState = snackbarHostState, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileForm(
    state: ProfileUiState.Content,
    viewModel: ProfileViewModel,
    onInstitucionalClick: () -> Unit,
    onVerificarIdentidadeClick: () -> Unit,
    onPlanosClick: () -> Unit,
) {
    val context = LocalContext.current
    val form = state.form

    val pickAvatar = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { viewModel.onAvatarPicked(context, it) }
    }
    val pickBanner = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { viewModel.onBannerPicked(context, it) }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(TcSpacing.sp4)) {
        // --- Avatar ---
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            Box(
                Modifier.size(96.dp).clip(CircleShape).background(TcGradient.AvatarFallback)
                    .clickable(enabled = !state.uploadingAvatar) { pickAvatar.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                contentAlignment = Alignment.Center
            ) {
                if (state.uploadingAvatar) {
                    CircularProgressIndicator(color = Color.White)
                } else if (state.avatarUrl != null) {
                    AsyncImage(model = state.avatarUrl, contentDescription = stringResource(R.string.profile_avatar_cd), contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                } else {
                    Text(form.name.take(1).uppercase().ifBlank { "?" }, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 32.sp)
                }
                Box(
                    Modifier.align(Alignment.BottomEnd).size(28.dp).clip(CircleShape)
                        .background(TcColors.Primary).border(2.dp, Color.White, CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(Icons.Filled.CameraAlt, contentDescription = stringResource(R.string.profile_change_photo), tint = Color.White, modifier = Modifier.size(14.dp))
                }
            }
        }
        Spacer(Modifier.height(TcSpacing.sp6))

        // --- Banner ---
        Text(stringResource(R.string.profile_banner_header), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
        Spacer(Modifier.height(TcSpacing.sp2))
        if (state.hasBannerPlan) {
            Box(
                Modifier.fillMaxWidth().aspectRatio(3f).clip(TcShape.CategoryCard)
                    .background(TcColors.BgAlt)
                    .clickable(enabled = !state.uploadingBanner) { pickBanner.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                contentAlignment = Alignment.Center
            ) {
                when {
                    state.uploadingBanner -> CircularProgressIndicator(color = TcColors.Primary)
                    state.bannerUrl != null -> AsyncImage(model = state.bannerUrl, contentDescription = stringResource(R.string.profile_banner_cd), contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    else -> Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = TcColors.TextMuted)
                        Spacer(Modifier.width(TcSpacing.sp2))
                        Text(stringResource(R.string.profile_add_banner), color = TcColors.TextMuted)
                    }
                }
            }
        } else {
            Box(Modifier.fillMaxWidth().background(TcColors.BgAlt, TcShape.CategoryCard).padding(TcSpacing.sp4)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.Lock, contentDescription = null, tint = TcColors.TextMuted, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(TcSpacing.sp2))
                    Text(stringResource(R.string.profile_banner_locked), style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted, modifier = Modifier.weight(1f))
                }
            }
        }
        Spacer(Modifier.height(TcSpacing.sp6))

        // --- Verificações ---
        Text(stringResource(R.string.profile_verifications_header), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
        Spacer(Modifier.height(TcSpacing.sp2))
        VerificationRow(stringResource(R.string.auth_email_label), state.emailVerified)
        VerificationRow(stringResource(R.string.profile_whatsapp), state.phoneVerified)
        VerificationRow(
            stringResource(R.string.profile_identity), state.kycStatus == "approved",
            pendingLabel = if (state.kycStatus == "pending") stringResource(R.string.profile_status_in_review) else stringResource(R.string.profile_status_pending),
            onClick = onVerificarIdentidadeClick,
        )
        Spacer(Modifier.height(TcSpacing.sp6))
        HorizontalDivider(color = TcColors.BorderLight)
        Spacer(Modifier.height(TcSpacing.sp6))

        // --- Dados ---
        Text(stringResource(R.string.profile_personal_data), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = TcColors.Text)
        Spacer(Modifier.height(TcSpacing.sp4))

        LabeledField(stringResource(R.string.profile_field_name), form.name) { viewModel.onFormChange(form.copy(name = it)) }
        LabeledField(stringResource(R.string.profile_field_display_name), form.displayName) { viewModel.onFormChange(form.copy(displayName = it)) }
        LabeledField(stringResource(R.string.profile_field_document), form.documentNumber) { viewModel.onFormChange(form.copy(documentNumber = it)) }
        LabeledField(stringResource(R.string.profile_whatsapp), form.phoneWhatsapp) { viewModel.onFormChange(form.copy(phoneWhatsapp = it)) }

        Spacer(Modifier.height(TcSpacing.sp4))
        Text(stringResource(R.string.profile_address_header), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = TcColors.Text)
        Spacer(Modifier.height(TcSpacing.sp4))

        LabeledField(stringResource(R.string.profile_field_zip), form.zipCode) { viewModel.onFormChange(form.copy(zipCode = it)) }
        LabeledField(stringResource(R.string.profile_field_street), form.street) { viewModel.onFormChange(form.copy(street = it)) }
        Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
            Box(Modifier.weight(1f)) { LabeledField(stringResource(R.string.profile_field_number), form.number) { viewModel.onFormChange(form.copy(number = it)) } }
            Box(Modifier.weight(2f)) { LabeledField(stringResource(R.string.profile_field_complement), form.complement) { viewModel.onFormChange(form.copy(complement = it)) } }
        }
        LabeledField(stringResource(R.string.profile_field_neighborhood), form.neighborhood) { viewModel.onFormChange(form.copy(neighborhood = it)) }
        LabeledField(stringResource(R.string.listagem_city), form.city) { viewModel.onFormChange(form.copy(city = it)) }
        LabeledField(stringResource(R.string.listagem_state), form.state) { viewModel.onFormChange(form.copy(state = it)) }

        Spacer(Modifier.height(TcSpacing.sp2))
        var countryExpanded by remember { mutableStateOf(false) }
        val countries = profileCountries()
        ExposedDropdownMenuBox(expanded = countryExpanded, onExpandedChange = { countryExpanded = it }, modifier = Modifier.padding(vertical = TcSpacing.sp1)) {
            OutlinedTextField(
                value = countries.find { it.first == form.country }?.second ?: form.country,
                onValueChange = {}, readOnly = true, label = { Text(stringResource(R.string.listagem_country)) }, shape = TcShape.Input,
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = countryExpanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor()
            )
            ExposedDropdownMenu(expanded = countryExpanded, onDismissRequest = { countryExpanded = false }) {
                countries.forEach { (code, label) ->
                    DropdownMenuItem(text = { Text(label) }, onClick = { viewModel.onFormChange(form.copy(country = code)); countryExpanded = false })
                }
            }
        }

        Spacer(Modifier.height(TcSpacing.sp4))
        OutlinedTextField(
            value = form.bio, onValueChange = { viewModel.onFormChange(form.copy(bio = it)) },
            label = { Text(stringResource(R.string.profile_field_bio)) }, minLines = 3, shape = TcShape.Input, modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(TcSpacing.sp6))
        GradientButton(
            text = stringResource(R.string.common_save_changes), onClick = viewModel::onSave,
            gradient = TcGradient.Primary, shadowLayers = TcShadow.Green,
            loading = state.saving, modifier = Modifier.fillMaxWidth()
        )

        Spacer(Modifier.height(TcSpacing.sp6))
        HorizontalDivider(color = TcColors.BorderLight)
        Spacer(Modifier.height(TcSpacing.sp4))
        Row(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onPlanosClick).padding(vertical = TcSpacing.sp2),
            horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically
        ) {
            Text(stringResource(R.string.profile_menu_plans), color = TcColors.Text)
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TcColors.TextLight)
        }
        Spacer(Modifier.height(TcSpacing.sp4))
        Row(
            modifier = Modifier.fillMaxWidth().clickable(onClick = onInstitucionalClick).padding(vertical = TcSpacing.sp2),
            horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically
        ) {
            Text(stringResource(R.string.profile_menu_institutional), color = TcColors.Text)
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TcColors.TextLight)
        }
        Spacer(Modifier.height(TcSpacing.sp6))
        HorizontalDivider(color = TcColors.BorderLight)
        Spacer(Modifier.height(TcSpacing.sp4))
        Text("Idioma", style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
        Spacer(Modifier.height(TcSpacing.sp2))
        LanguageToggle()
        Spacer(Modifier.height(TcSpacing.sp4))
        OutlinedButton(onClick = viewModel::onLogout, modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.profile_logout), color = TcColors.Error)
        }
        Spacer(Modifier.height(TcSpacing.sp8))
    }
}

/** Idioma por app (PT/ES) — AppCompatDelegate recria as Activities sozinho ao trocar. */
@Composable
private fun LanguageToggle() {
    var selected by remember { mutableStateOf(LocaleManager.currentLanguageTag() ?: LocaleManager.PORTUGUESE) }

    Row(Modifier.fillMaxWidth().background(TcColors.BgAlt, TcShape.Pill).padding(4.dp)) {
        LanguageToggleTab("Português", selected == LocaleManager.PORTUGUESE, Modifier.weight(1f)) {
            selected = LocaleManager.PORTUGUESE
            LocaleManager.setLanguage(LocaleManager.PORTUGUESE)
        }
        LanguageToggleTab("Español", selected == LocaleManager.SPANISH, Modifier.weight(1f)) {
            selected = LocaleManager.SPANISH
            LocaleManager.setLanguage(LocaleManager.SPANISH)
        }
    }
}

@Composable
private fun LanguageToggleTab(label: String, active: Boolean, modifier: Modifier, onClick: () -> Unit) {
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
private fun LabeledField(label: String, value: String, onValueChange: (String) -> Unit) {
    OutlinedTextField(
        value = value, onValueChange = onValueChange, label = { Text(label) },
        singleLine = true, shape = TcShape.Input,
        modifier = Modifier.fillMaxWidth().padding(vertical = TcSpacing.sp1)
    )
}

@Composable
private fun VerificationRow(label: String, verified: Boolean, pendingLabel: String = stringResource(R.string.profile_status_pending), onClick: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().let { if (onClick != null) it.clickable(onClick = onClick) else it }.padding(vertical = TcSpacing.sp2),
        horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically
    ) {
        Text(label, color = TcColors.Text)
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (verified) VerifiedBadge() else {
                Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(pendingLabel, style = MaterialTheme.typography.labelMedium, color = TcColors.TextLight)
            }
            if (onClick != null) {
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(16.dp))
            }
        }
    }
}
