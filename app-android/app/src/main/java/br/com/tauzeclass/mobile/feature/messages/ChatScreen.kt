package br.com.tauzeclass.mobile.feature.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.components.VerifiedBadge
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(onBackClick: () -> Unit, viewModel: ChatViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val listState = rememberLazyListState()

    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): estava chaveado no
    // uiState INTEIRO (que inclui draft/sending) — cada tecla digitada
    // recriava o Content e disparava animateScrollToItem de novo, jogando o
    // usuário pro fim da lista mesmo sem mensagem nova, atrapalhando quem
    // rolava pra cima pra reler o histórico enquanto escrevia. Chavear só
    // pelo tamanho da lista de mensagens faz o efeito rodar apenas quando
    // uma mensagem é de fato adicionada/removida.
    val messageCount = (uiState as? ChatUiState.Content)?.messages?.size ?: 0
    LaunchedEffect(messageCount) {
        if (messageCount > 0) listState.animateScrollToItem(messageCount - 1)
    }

    Scaffold(
        containerColor = TcColors.BgAlt,
        topBar = {
            TopAppBar(
                title = {
                    val content = uiState as? ChatUiState.Content
                    Column {
                        // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): otherVerified
                        // já era calculado no ChatViewModel mas nunca renderizado
                        // aqui — inconsistente com MessagesScreen/VendedorScreen,
                        // que mostram o mesmo selo pro mesmo dado de perfil.
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(content?.otherName ?: stringResource(R.string.chat_title_fallback), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (content?.otherVerified == true) {
                                Spacer(Modifier.width(TcSpacing.sp1))
                                VerifiedBadge()
                            }
                        }
                        content?.adTitle?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = TcColors.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
                    }
                },
                navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = TcColors.Surface)
            )
        },
        bottomBar = {
            (uiState as? ChatUiState.Content)?.let { content ->
                ChatInputBar(value = content.draft, sending = content.sending, onValueChange = viewModel::onDraftChange, onSend = viewModel::onSend)
            }
        }
    ) { padding ->
        when (val state = uiState) {
            ChatUiState.Loading -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) { CircularProgressIndicator(color = TcColors.Primary) }
            is ChatUiState.Error -> ErrorState(state.message, viewModel::retry, Modifier.padding(padding))
            is ChatUiState.Content -> Column(Modifier.fillMaxSize().padding(padding)) {
                LazyColumn(
                    state = listState, modifier = Modifier.weight(1f).fillMaxWidth(),
                    contentPadding = PaddingValues(TcSpacing.sp4),
                    verticalArrangement = Arrangement.spacedBy(TcSpacing.sp2)
                ) {
                    items(state.messages, key = { it.id }) { msg -> MessageBubble(msg, isMine = msg.senderId == state.myId) }
                }
                state.errorMessage?.let {
                    Text(it, color = TcColors.Error, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp1))
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(msg: MessageRow, isMine: Boolean) {
    val shape = if (isMine) RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 16.dp, bottomEnd = 4.dp)
                else RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp, bottomStart = 4.dp, bottomEnd = 16.dp)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start) {
        Column(
            Modifier.widthIn(max = 280.dp).tcShadow(TcShadow.Xs, shape)
                .background(if (isMine) TcColors.Primary else TcColors.Surface, shape)
                .padding(horizontal = TcSpacing.sp3, vertical = TcSpacing.sp2)
        ) {
            Text(msg.content, color = if (isMine) Color.White else TcColors.Text, style = MaterialTheme.typography.bodyMedium)
            Spacer(Modifier.height(2.dp))
            Text(
                formatMessageTime(msg.createdAt), style = MaterialTheme.typography.labelSmall,
                color = if (isMine) Color.White.copy(alpha = 0.75f) else TcColors.TextLight,
                modifier = Modifier.align(Alignment.End)
            )
        }
    }
}

@Composable
private fun ChatInputBar(value: String, sending: Boolean, onValueChange: (String) -> Unit, onSend: () -> Unit) {
    Surface(color = TcColors.Surface) {
        Row(
            Modifier.fillMaxWidth().padding(TcSpacing.sp3).navigationBarsPadding().imePadding(),
            verticalAlignment = Alignment.Bottom
        ) {
            OutlinedTextField(
                value = value, onValueChange = onValueChange,
                placeholder = { Text(stringResource(R.string.chat_input_placeholder)) },
                shape = TcShape.Input, maxLines = 4, modifier = Modifier.weight(1f),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = TcColors.Primary, unfocusedBorderColor = TcColors.Border)
            )
            Spacer(Modifier.width(TcSpacing.sp2))
            GradientButton(
                text = "", onClick = onSend, icon = Icons.AutoMirrored.Filled.Send,
                gradient = TcGradient.Primary, shadowLayers = TcShadow.Green,
                enabled = value.isNotBlank() && !sending, loading = sending,
                shape = CircleShape, height = 48.dp, modifier = Modifier.size(48.dp)
            )
        }
    }
}

private fun formatMessageTime(createdAt: String?): String {
    if (createdAt == null) return ""
    return try { DateTimeFormatter.ofPattern("HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(createdAt)) }
    catch (e: Exception) { "" }
}
