package br.com.tauzeclass.mobile.feature.kyc

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CreditCard
import androidx.compose.material.icons.filled.Image
import androidx.compose.material3.Button
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
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import kotlinx.coroutines.launch
import android.content.Context
import android.net.Uri
import java.io.File

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VerificacaoScreen(onBackClick: () -> Unit, viewModel: KycViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel) {
        viewModel.events.collect { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.kyc_title)) },
                navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val state = uiState) {
                KycUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                is KycUiState.Error -> ErrorState(state.message, viewModel::retry)
                is KycUiState.Content -> VerificacaoContent(state, viewModel)
            }
        }
    }
}

@Composable
private fun VerificacaoContent(state: KycUiState.Content, viewModel: KycViewModel) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(TcSpacing.sp4)) {
        Text(
            stringResource(R.string.kyc_subtitle),
            style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted
        )
        Spacer(Modifier.height(TcSpacing.sp6))

        if (state.verified) {
            VerifiedPanel()
        } else {
            GovBrCard(onClick = viewModel::onGovBrClick)
            Spacer(Modifier.height(TcSpacing.sp4))
            PlanBadgeCard()
            Spacer(Modifier.height(TcSpacing.sp4))
            ManualUploadCard(state, viewModel)
        }
        Spacer(Modifier.height(TcSpacing.sp6))
    }
}

@Composable
private fun VerifiedPanel() {
    Column(
        Modifier.fillMaxWidth().background(Color(0xFFF0FDF4), TcShape.CategoryCard)
            .border(1.dp, Color(0xFFBBF7D0), TcShape.CategoryCard).padding(TcSpacing.sp8),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(Modifier.size(64.dp).background(TcColors.Primary, CircleShape), Alignment.Center) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Color.White, modifier = Modifier.size(32.dp))
        }
        Spacer(Modifier.height(TcSpacing.sp4))
        Text(stringResource(R.string.kyc_verified_title), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = Color(0xFF166534))
        Spacer(Modifier.height(TcSpacing.sp2))
        Text(stringResource(R.string.kyc_verified_desc), color = Color(0xFF15803D), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun InfoCard(icon: androidx.compose.ui.graphics.vector.ImageVector, iconTint: Color, title: String, description: String, action: @Composable () -> Unit) {
    Column(Modifier.fillMaxWidth().background(TcColors.Surface, TcShape.CategoryCard).border(1.dp, TcColors.Border, TcShape.CategoryCard).padding(TcSpacing.sp4)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, contentDescription = null, tint = iconTint, modifier = Modifier.size(20.dp))
            Spacer(Modifier.width(TcSpacing.sp2))
            Text(title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = TcColors.Text)
        }
        Spacer(Modifier.height(TcSpacing.sp2))
        Text(description, style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted)
        Spacer(Modifier.height(TcSpacing.sp3))
        action()
    }
}

/** Gov.br não é uma integração real — nem no site (é um botão de exibição que expande o envio manual). */
@Composable
private fun GovBrCard(onClick: () -> Unit) {
    InfoCard(
        icon = Icons.Filled.AccountBalance, iconTint = Color(0xFF2563EB),
        title = stringResource(R.string.kyc_govbr_title),
        description = stringResource(R.string.kyc_govbr_desc),
    ) {
        Button(onClick = onClick) { Text(stringResource(R.string.kyc_govbr_button)) }
    }
}

/** "Planos + checkout" ainda não existe no app nativo (próximo item do roteiro) — card fica informativo por enquanto. */
@Composable
private fun PlanBadgeCard() {
    InfoCard(
        icon = Icons.Filled.CreditCard, iconTint = Color(0xFFEAB308),
        title = stringResource(R.string.kyc_plan_badge_title),
        description = stringResource(R.string.kyc_plan_badge_desc),
    ) {
        Text(stringResource(R.string.kyc_plan_badge_soon), style = MaterialTheme.typography.labelMedium, color = TcColors.TextLight)
    }
}

@Composable
private fun ManualUploadCard(state: KycUiState.Content, viewModel: KycViewModel) {
    Column(Modifier.fillMaxWidth().background(TcColors.Surface, TcShape.CategoryCard).border(1.dp, TcColors.Border, TcShape.CategoryCard).padding(TcSpacing.sp4)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.kyc_manual_title), style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold), color = TcColors.Text)
                Spacer(Modifier.height(TcSpacing.sp1))
                Text(
                    stringResource(R.string.kyc_manual_desc),
                    style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted
                )
            }
            Spacer(Modifier.width(TcSpacing.sp3))
            OutlinedButton(onClick = viewModel::onToggleManualForm) {
                Text(if (state.showManualForm) stringResource(R.string.kyc_collapse) else stringResource(R.string.kyc_attach))
            }
        }

        if (!state.showManualForm && state.requestStatus == "pending") {
            Spacer(Modifier.height(TcSpacing.sp3))
            StatusBanner(stringResource(R.string.kyc_pending_review), Color(0xFFFFFBEB), Color(0xFFB45309))
        }
        if (!state.showManualForm && state.requestStatus == "rejected") {
            Spacer(Modifier.height(TcSpacing.sp3))
            StatusBanner(stringResource(R.string.kyc_rejected), Color(0xFFFEF2F2), Color(0xFFB91C1C))
        }

        if (state.showManualForm) {
            Spacer(Modifier.height(TcSpacing.sp4))
            ManualUploadForm(state, viewModel)
        }
    }
}

@Composable
private fun StatusBanner(text: String, background: Color, contentColor: Color) {
    Box(Modifier.fillMaxWidth().background(background, TcShape.CategoryIcon).padding(horizontal = TcSpacing.sp3, vertical = TcSpacing.sp3)) {
        Text(text, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Medium), color = contentColor)
    }
}

@Composable
private fun ManualUploadForm(state: KycUiState.Content, viewModel: KycViewModel) {
    val context = LocalContext.current
    val pickFront = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { viewModel.onFrontPicked(context, it) } }
    val pickBack = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> uri?.let { viewModel.onBackPicked(context, it) } }
    // Site usa capture="user" só na selfie (abre câmera frontal direto); documentos ficam sem capture (galeria/picker comum).
    // TakePicture() (câmera do sistema, resolução real) em vez de TakePicturePreview() (thumbnail
    // baixa resolução) — documento de identidade precisa de qualidade suficiente pra análise humana.
    var pendingSelfieUri by remember { mutableStateOf<Uri?>(null) }
    val takeSelfie = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        if (success) pendingSelfieUri?.let { viewModel.onSelfiePicked(context, it) }
    }

    Column(Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = state.cpfCnpj, onValueChange = viewModel::onCpfCnpjChange,
            label = { Text(stringResource(R.string.kyc_doc_label)) }, placeholder = { Text(stringResource(R.string.kyc_doc_placeholder)) },
            singleLine = true, shape = TcShape.Input, modifier = Modifier.fillMaxWidth()
        )
        if (state.cpfCnpj.filter(Char::isDigit).isNotEmpty()) {
            Spacer(Modifier.height(TcSpacing.sp1))
            val label = if (state.docType == KycDocType.PESSOA_FISICA) stringResource(R.string.kyc_type_individual) else stringResource(R.string.kyc_type_company)
            Text(stringResource(R.string.kyc_type_detected, label), style = MaterialTheme.typography.labelSmall, color = TcColors.TextMuted)
        }

        Spacer(Modifier.height(TcSpacing.sp4))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
            DocPickerSlot(
                label = stringResource(R.string.kyc_doc_front), uri = state.docFrontUri, modifier = Modifier.weight(1f),
                onClick = { pickFront.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            )
            DocPickerSlot(
                label = stringResource(R.string.kyc_doc_back), uri = state.docBackUri, modifier = Modifier.weight(1f),
                onClick = { pickBack.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
            )
        }

        Spacer(Modifier.height(TcSpacing.sp4))
        DocPickerSlot(
            label = stringResource(R.string.kyc_selfie_label), uri = state.selfieUri, modifier = Modifier.fillMaxWidth(),
            onClick = {
                val uri = createKycCaptureUri(context)
                pendingSelfieUri = uri
                takeSelfie.launch(uri)
            }
        )

        Spacer(Modifier.height(TcSpacing.sp5))
        GradientButton(
            text = if (state.uploading) stringResource(R.string.kyc_uploading) else stringResource(R.string.kyc_submit),
            onClick = { viewModel.onSubmit(context) },
            gradient = TcGradient.Primary, shadowLayers = TcShadow.Green,
            enabled = state.canSubmit, loading = state.uploading, modifier = Modifier.fillMaxWidth()
        )
    }
}

/** Path privado do app — nunca exposto fora do FileProvider, some quando o cache é limpo. */
private fun createKycCaptureUri(context: Context): Uri {
    val dir = File(context.cacheDir, "kyc").apply { mkdirs() }
    val file = File(dir, "selfie_${System.currentTimeMillis()}.jpg")
    return FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
}

@Composable
private fun DocPickerSlot(label: String, uri: Uri?, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = TcColors.Text)
        Spacer(Modifier.height(TcSpacing.sp1))
        Box(
            Modifier.fillMaxWidth().height(48.dp).background(TcColors.BgAlt, TcShape.Input)
                .border(1.dp, TcColors.Border, TcShape.Input).clickable(onClick = onClick).padding(horizontal = TcSpacing.sp3),
            contentAlignment = Alignment.CenterStart
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (uri != null) Icons.Filled.CheckCircle else Icons.Filled.Image,
                    contentDescription = null, tint = if (uri != null) TcColors.Primary else TcColors.TextLight, modifier = Modifier.size(18.dp)
                )
                Spacer(Modifier.width(TcSpacing.sp2))
                Text(if (uri != null) stringResource(R.string.kyc_file_selected) else stringResource(R.string.kyc_file_select), style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted)
            }
        }
    }
}
