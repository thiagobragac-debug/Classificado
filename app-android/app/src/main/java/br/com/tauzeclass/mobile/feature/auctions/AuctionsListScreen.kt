package br.com.tauzeclass.mobile.feature.auctions

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.ImageNotSupported
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlinx.coroutines.delay
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private object AuctionStatusColors {
    val Live = Color(0xFFEF4444)
    val Scheduled = Color(0xFF3B82F6)
    val Closed = Color(0xFF6B7280)
    val Cancelled = Color(0xFF991B1B)
}

private fun AuctionEventState.badgeColor() = when (this) {
    AuctionEventState.LIVE -> AuctionStatusColors.Live
    AuctionEventState.SCHEDULED -> AuctionStatusColors.Scheduled
    AuctionEventState.CLOSED -> AuctionStatusColors.Closed
    AuctionEventState.CANCELLED -> AuctionStatusColors.Cancelled
}

@Composable
private fun AuctionEventState.badgeLabel() = when (this) {
    AuctionEventState.LIVE -> stringResource(R.string.auctions_badge_live)
    AuctionEventState.SCHEDULED -> stringResource(R.string.auctions_badge_scheduled)
    AuctionEventState.CLOSED -> stringResource(R.string.auctions_badge_closed)
    AuctionEventState.CANCELLED -> stringResource(R.string.auctions_badge_cancelled)
}

@Composable
private fun AuctionEventState.ctaLabel() = when (this) {
    AuctionEventState.LIVE -> stringResource(R.string.auctions_cta_join)
    AuctionEventState.SCHEDULED -> stringResource(R.string.auctions_cta_view_lots)
    AuctionEventState.CLOSED -> stringResource(R.string.auctions_cta_results)
    AuctionEventState.CANCELLED -> stringResource(R.string.auctions_cta_cancelled)
}

@Composable
private fun statusFilterLabel(status: AuctionStatusFilter): String = when (status) {
    AuctionStatusFilter.ATIVOS -> stringResource(R.string.myads_filter_active)
    AuctionStatusFilter.TODOS -> stringResource(R.string.listagem_all_male)
    AuctionStatusFilter.ENCERRADOS -> stringResource(R.string.auctions_filter_closed)
    AuctionStatusFilter.CANCELADOS -> stringResource(R.string.auctions_filter_cancelled)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuctionsListScreen(onBackClick: () -> Unit, onAuctionClick: (AuctionEvent) -> Unit, viewModel: AuctionsListViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }

    LaunchedEffect(query) {
        delay(400)
        viewModel.onSearchChange(query)
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(stringResource(R.string.auctions_list_title)) },
            navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
        )
    }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                placeholder = { Text(stringResource(R.string.auctions_search_placeholder)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true, shape = TcShape.CategoryCard,
                modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp3)
            )

            val currentStatus = (uiState as? AuctionsListUiState.Content)?.filters?.status ?: AuctionStatusFilter.ATIVOS
            Row(
                horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2),
                modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4)
            ) {
                AuctionStatusFilter.entries.forEach { status ->
                    FilterChip(
                        selected = currentStatus == status,
                        onClick = { viewModel.onStatusFilterChange(status) },
                        label = { Text(statusFilterLabel(status)) }
                    )
                }
            }
            Spacer(Modifier.height(TcSpacing.sp2))

            when (val state = uiState) {
                AuctionsListUiState.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = TcColors.Primary) }
                is AuctionsListUiState.Error -> ErrorState(state.message, viewModel::retry)
                is AuctionsListUiState.Content -> {
                    if (state.events.isEmpty()) {
                        Box(Modifier.fillMaxSize().padding(TcSpacing.sp8), Alignment.Center) {
                            Text(stringResource(R.string.auctions_empty), color = TcColors.TextMuted)
                        }
                    } else {
                        LazyColumn(contentPadding = PaddingValues(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)) {
                            items(state.events, key = { it.id }) { event ->
                                AuctionCard(event, onClick = { onAuctionClick(event) })
                                Spacer(Modifier.height(TcSpacing.sp3))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun AuctionCard(event: AuctionEvent, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val state = remember(event) { event.resolveState() }
    androidx.compose.material3.Card(
        onClick = onClick,
        shape = TcShape.AdCard,
        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = TcColors.Surface),
        elevation = androidx.compose.material3.CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = modifier.fillMaxWidth().tcShadow(TcShadow.Card, TcShape.AdCard)
    ) {
        Box {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current).data(event.cover).crossfade(300).build(),
                contentDescription = event.title,
                contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
                error = {
                    Box(Modifier.fillMaxSize().background(TcColors.BgAlt), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.ImageNotSupported, contentDescription = null, tint = TcColors.TextLight)
                    }
                }
            )
            Box(
                modifier = Modifier.align(Alignment.TopStart).padding(TcSpacing.sp3)
                    .background(state.badgeColor(), TcShape.Pill).padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(state.badgeLabel(), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
            }
        }
        Column(Modifier.padding(TcSpacing.sp4)) {
            Text(event.title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(4.dp))
            Text(formatEventDate(event.date), style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted)
            Spacer(Modifier.height(TcSpacing.sp2))
            Text(
                state.ctaLabel(), style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                color = if (state == AuctionEventState.CANCELLED) TcColors.TextLight else TcColors.Primary
            )
        }
    }
}

private fun formatEventDate(iso: String): String = try {
    DateTimeFormatter.ofPattern("dd/MM/yyyy 'às' HH:mm").withZone(ZoneId.systemDefault()).format(Instant.parse(iso))
} catch (e: Exception) {
    ""
}
