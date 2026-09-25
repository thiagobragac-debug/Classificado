package br.com.tauzeclass.mobile.feature.messages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.formatRelativeTime
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.components.VerifiedBadge
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import coil3.compose.AsyncImage

@Composable
fun MessagesTab(onOpenChat: (adId: String, otherId: String, otherName: String, adTitle: String) -> Unit, viewModel: MessagesViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    when (val state = uiState) {
        MessagesUiState.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = TcColors.Primary) }
        is MessagesUiState.Error -> ErrorState(state.message, viewModel::retry)
        is MessagesUiState.Content -> {
            if (state.conversations.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(TcSpacing.sp8), Alignment.Center) {
                    Text(stringResource(R.string.messages_empty), color = TcColors.TextMuted, textAlign = TextAlign.Center)
                }
            } else {
                LazyColumn(Modifier.fillMaxSize()) {
                    items(state.conversations, key = { it.key }) { conv ->
                        ConversationRow(conv, onClick = { onOpenChat(conv.adId, conv.otherId, conv.otherName, conv.adTitle) })
                        HorizontalDivider(color = TcColors.BorderLight)
                    }
                }
            }
        }
    }
}

@Composable
private fun ConversationRow(conv: Conversation, onClick: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick).padding(TcSpacing.sp4),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(48.dp).clip(CircleShape).background(TcGradient.AvatarFallback), contentAlignment = Alignment.Center) {
            if (conv.otherAvatarUrl != null) {
                AsyncImage(model = conv.otherAvatarUrl, contentDescription = conv.otherName, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(CircleShape))
            } else {
                Text(conv.otherName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
            }
        }
        Spacer(Modifier.width(TcSpacing.sp3))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    conv.otherName, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
                    maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false)
                )
                if (conv.otherVerified) { Spacer(Modifier.width(4.dp)); VerifiedBadge() }
            }
            Text(conv.adTitle, style = MaterialTheme.typography.labelSmall, color = TcColors.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(2.dp))
            Text(conv.lastMessage.content, style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(TcSpacing.sp2))
        Text(formatRelativeTime(conv.lastMessage.createdAt), style = MaterialTheme.typography.labelSmall, color = TcColors.TextLight)
    }
}
