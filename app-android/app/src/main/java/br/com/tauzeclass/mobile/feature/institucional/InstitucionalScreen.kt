package br.com.tauzeclass.mobile.feature.institucional

import android.webkit.WebView
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InstitucionalIndexScreen(
    onBackClick: () -> Unit,
    onPageClick: (String) -> Unit,
    viewModel: InstitucionalViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(stringResource(R.string.institucional_title)) },
            navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
        )
    }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val state = uiState) {
                InstitucionalUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                is InstitucionalUiState.Error -> ErrorState(state.message, viewModel::load)
                is InstitucionalUiState.Content -> {
                    val grouped = state.pages.groupBy { it.groupName }
                    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(vertical = TcSpacing.sp4)) {
                        grouped.forEach { (group, pages) ->
                            item {
                                Text(
                                    group.uppercase(),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = TcColors.TextMuted,
                                    modifier = Modifier.padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)
                                )
                            }
                            items(pages, key = { it.id }) { page ->
                                Column(Modifier.fillMaxWidth().clickable { onPageClick(page.id) }) {
                                    Box(
                                        modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp3)
                                    ) {
                                        Column(Modifier.fillMaxWidth()) {
                                            androidx.compose.foundation.layout.Row(
                                                modifier = Modifier.fillMaxWidth(),
                                                horizontalArrangement = Arrangement.SpaceBetween,
                                                verticalAlignment = Alignment.CenterVertically
                                            ) {
                                                Column(Modifier.weight(1f)) {
                                                    Text(page.title, style = MaterialTheme.typography.bodyLarge, color = TcColors.Text)
                                                    page.subtitle?.let {
                                                        Text(it, style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                                    }
                                                }
                                                Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = TcColors.TextLight)
                                            }
                                        }
                                    }
                                    HorizontalDivider(color = TcColors.BorderLight)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InstitucionalPageScreen(
    slug: String,
    onBackClick: () -> Unit,
    viewModel: InstitucionalViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val page = (uiState as? InstitucionalUiState.Content)?.pages?.find { it.id == slug }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(page?.title ?: "", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
        )
    }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when {
                uiState is InstitucionalUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                uiState is InstitucionalUiState.Error -> ErrorState((uiState as InstitucionalUiState.Error).message, viewModel::load)
                page == null -> ErrorState(stringResource(R.string.institucional_page_not_found), viewModel::load)
                slug == "contato" -> ContactFormSection(page = page)
                else -> InstitucionalWebView(html = page.content)
            }
        }
    }
}

@Composable
private fun InstitucionalWebView(html: String) {
    AndroidView(
        factory = { context ->
            WebView(context).apply {
                settings.javaScriptEnabled = false // conteúdo é só formatação — desliga JS por segurança, além do DOMPurify já aplicado no admin
                settings.loadWithOverviewMode = true
                settings.useWideViewPort = true
            }
        },
        update = { webView -> webView.loadDataWithBaseURL(null, wrapHtml(html), "text/html", "UTF-8", null) },
        modifier = Modifier.fillMaxSize()
    )
}

private fun wrapHtml(bodyHtml: String): String = """
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
      body { font-family: sans-serif; color: #0F172A; background: #FFFFFF; padding: 16px; line-height: 1.6; }
      h1,h2,h3 { color: #0F172A; }
      a { color: #16A34A; }
      details { border: 1px solid #E2E8F0; border-radius: 12px; padding: 12px; margin-bottom: 8px; }
    </style></head><body>$bodyHtml</body></html>
""".trimIndent()

private const val CONTACT_EMAIL_GENERAL = "contato@tauzeclass.com.br"
private const val CONTACT_EMAIL_SECURITY = "seguranca@tauzeclass.com.br"
private const val CONTACT_EMAIL_PRIVACY = "privacidade@tauzeclass.com.br"
private const val CONTACT_EMAIL_PARTNERSHIPS = "dev@tauzeclass.com.br"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ContactFormSection(page: InstitutionalPage, contactViewModel: ContactFormViewModel = hiltViewModel()) {
    var name by rememberSaveable { mutableStateOf("") }
    var email by rememberSaveable { mutableStateOf("") }
    var phone by rememberSaveable { mutableStateOf("") }
    var subject by rememberSaveable { mutableStateOf("") }
    var message by rememberSaveable { mutableStateOf("") }

    val sending by contactViewModel.sending.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(contactViewModel.events) {
        contactViewModel.events.collect { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
    }

    Box(Modifier.fillMaxSize()) {
        Column(
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(TcSpacing.sp4)
        ) {
            Text(page.title, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold), color = TcColors.Text)
            page.subtitle?.let {
                Spacer(Modifier.height(TcSpacing.sp1))
                Text(it, style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted)
            }
            Spacer(Modifier.height(TcSpacing.sp5))

            ContactChannelCard(stringResource(R.string.institucional_channel_general), CONTACT_EMAIL_GENERAL)
            ContactChannelCard(stringResource(R.string.institucional_channel_security), CONTACT_EMAIL_SECURITY)
            ContactChannelCard(stringResource(R.string.institucional_channel_privacy), CONTACT_EMAIL_PRIVACY)
            ContactChannelCard(stringResource(R.string.institucional_channel_partnerships), CONTACT_EMAIL_PARTNERSHIPS)

            Spacer(Modifier.height(TcSpacing.sp5))
            HorizontalDivider(color = TcColors.BorderLight)
            Spacer(Modifier.height(TcSpacing.sp5))

            Text(stringResource(R.string.institucional_contact_heading), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold), color = TcColors.Text)
            Spacer(Modifier.height(TcSpacing.sp4))

            // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): name/subject não
            // tinham limite superior no client, diferente do backend
            // (isNonEmptyString(name/subject, 200) em app/api/contact/route.ts)
            // — nome/assunto acima de 200 chars passavam na validação local,
            // habilitavam o botão, e só eram rejeitados pelo backend com uma
            // mensagem genérica que não indicava o campo problemático.
            OutlinedTextField(value = name, onValueChange = { if (it.length <= 200) name = it }, label = { Text(stringResource(R.string.institucional_field_name)) }, singleLine = true, shape = TcShape.Input, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(TcSpacing.sp3))
            OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text(stringResource(R.string.auth_email_label)) }, singleLine = true, shape = TcShape.Input, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(TcSpacing.sp3))
            OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text(stringResource(R.string.institucional_field_phone)) }, singleLine = true, shape = TcShape.Input, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(TcSpacing.sp3))
            OutlinedTextField(value = subject, onValueChange = { if (it.length <= 200) subject = it }, label = { Text(stringResource(R.string.institucional_field_subject)) }, singleLine = true, shape = TcShape.Input, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(TcSpacing.sp3))
            OutlinedTextField(
                value = message, onValueChange = { message = it }, label = { Text(stringResource(R.string.institucional_field_message)) },
                minLines = 4, shape = TcShape.Input, modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(TcSpacing.sp5))

            val formValid = name.trim().length >= 2 && email.contains("@") && subject.trim().isNotBlank() && message.trim().length in 10..5000
            GradientButton(
                text = stringResource(R.string.ads_detail_send_message),
                onClick = {
                    contactViewModel.send(name.trim(), email.trim(), phone.trim().ifBlank { null }, subject.trim(), message.trim()) {
                        name = ""; email = ""; phone = ""; subject = ""; message = ""
                    }
                },
                gradient = TcGradient.Primary,
                shadowLayers = TcShadow.Green,
                enabled = formValid,
                loading = sending,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(TcSpacing.sp6))
        }
        SnackbarHost(hostState = snackbarHostState, modifier = Modifier.align(Alignment.BottomCenter))
    }
}

@Composable
private fun ContactChannelCard(label: String, email: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = TcSpacing.sp1)) {
        Text(label, style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
        Text(email, style = MaterialTheme.typography.bodyMedium, color = TcColors.Primary, fontWeight = FontWeight.SemiBold)
    }
}
