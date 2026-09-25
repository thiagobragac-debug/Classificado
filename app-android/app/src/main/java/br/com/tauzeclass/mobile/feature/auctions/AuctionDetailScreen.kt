package br.com.tauzeclass.mobile.feature.auctions

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.outlined.ImageNotSupported
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.formatPrice
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
import java.time.Duration
import java.time.Instant

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AuctionDetailScreen(onBackClick: () -> Unit, viewModel: AuctionDetailViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(topBar = {
        TopAppBar(
            title = { Text((uiState as? AuctionDetailUiState.Content)?.event?.title ?: stringResource(R.string.auctions_detail_title_fallback), maxLines = 1) },
            navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
        )
    }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val state = uiState) {
                AuctionDetailUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                is AuctionDetailUiState.Error -> ErrorState(state.message, viewModel::retry)
                is AuctionDetailUiState.Content -> AuctionDetailContent(state, viewModel)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuctionDetailContent(state: AuctionDetailUiState.Content, viewModel: AuctionDetailViewModel) {
    val event = state.event

    LazyVerticalGrid(columns = GridCells.Fixed(2), contentPadding = PaddingValues(bottom = TcSpacing.sp6)) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            Column {
                if (state.state == AuctionEventState.LIVE && !event.youtube.isNullOrBlank()) {
                    YoutubeEmbed(event.youtube)
                } else {
                    Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(TcColors.BgAlt)) {
                        if (event.cover != null) {
                            SubcomposeAsyncImage(
                                model = ImageRequest.Builder(LocalContext.current).data(event.cover).crossfade(300).build(),
                                contentDescription = event.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            Icon(Icons.Outlined.ImageNotSupported, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.align(Alignment.Center))
                        }
                    }
                }

                if (state.state == AuctionEventState.SCHEDULED) {
                    Box(Modifier.fillMaxWidth().background(TcColors.Text).padding(TcSpacing.sp4), contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(stringResource(R.string.auctions_starts_in), color = Color.White.copy(alpha = 0.8f), style = MaterialTheme.typography.bodySmall)
                            CountdownText(targetIso = event.date, onExpire = viewModel::onCountdownExpired)
                        }
                    }
                }

                if (state.state == AuctionEventState.LIVE && !event.acceptsBids) {
                    StatusBanner(stringResource(R.string.auctions_not_accepting_bids), TcColors.Warning)
                }
                if (state.state == AuctionEventState.CANCELLED) {
                    StatusBanner(stringResource(R.string.auctions_banner_cancelled), TcColors.Error)
                }
                if (state.state == AuctionEventState.CLOSED) {
                    StatusBanner(stringResource(R.string.auctions_banner_closed), TcColors.TextMuted)
                }

                // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): event.catalog já
                // era buscado do backend mas nunca exibido — gap de paridade com
                // o site (leiloes/[slug]/page.tsx), que mostra este link. Mesma
                // checagem de segurança do site (isSafeExternalUrl: só http/https).
                event.catalog?.takeIf { it.startsWith("http://") || it.startsWith("https://") }?.let { safeCatalogUrl ->
                    val context = LocalContext.current
                    OutlinedButton(
                        onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safeCatalogUrl))) } },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)
                    ) {
                        Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.auctions_download_catalog))
                    }
                }

                Text(
                    stringResource(R.string.auctions_lots_count, state.lots.size),
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                    modifier = Modifier.padding(TcSpacing.sp4)
                )
            }
        }

        if (state.lots.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Box(Modifier.fillMaxWidth().padding(TcSpacing.sp8), Alignment.Center) {
                    Text(stringResource(R.string.auctions_no_lots), color = TcColors.TextMuted)
                }
            }
        } else {
            items(state.lots, key = { it.id }) { lot ->
                LotCard(lot, isWinning = lot.isWinning(state.myUserId), onClick = { viewModel.onLotClick(lot) })
            }
        }
    }

    if (state.selectedLot != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(onDismissRequest = viewModel::onDismissLotSheet, sheetState = sheetState) {
            LotBidSheetContent(
                lot = state.selectedLot,
                step = event.step,
                state = state.state,
                pendingBidAmount = state.pendingBidAmount,
                manualBidText = state.manualBidText,
                bidding = state.bidding,
                bidErrorMessage = state.bidErrorMessage,
                onManualBidTextChange = viewModel::onManualBidTextChange,
                onRequestBid = viewModel::requestBid,
                onRequestManualBid = viewModel::requestManualBid,
                onConfirmBid = viewModel::confirmBid,
                onCancelPendingBid = viewModel::cancelPendingBid,
            )
        }
    }
}

@Composable
private fun StatusBanner(message: String, color: Color) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)
            .background(color.copy(alpha = 0.1f), TcShape.CategoryIcon).padding(TcSpacing.sp3)
    ) {
        Text(message, color = color, style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
private fun LotCard(lot: AuctionLot, isWinning: Boolean, onClick: () -> Unit) {
    androidx.compose.material3.Card(
        onClick = onClick, shape = TcShape.AdCard,
        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = TcColors.Surface),
        elevation = androidx.compose.material3.CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = Modifier.padding(TcSpacing.sp2).tcShadow(TcShadow.Card, TcShape.AdCard)
    ) {
        Box {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(lot.image).crossfade(300).build(),
                contentDescription = lot.title, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(1f),
                error = { Box(Modifier.fillMaxSize().background(TcColors.BgAlt), Alignment.Center) { Icon(Icons.Outlined.ImageNotSupported, contentDescription = null, tint = TcColors.TextLight) } }
            )
            if (isWinning) {
                Box(
                    Modifier.align(Alignment.TopStart).padding(6.dp).background(TcColors.Success, TcShape.Pill).padding(horizontal = 8.dp, vertical = 3.dp)
                ) { Text(stringResource(R.string.auctions_winning_badge), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold) }
            }
        }
        Column(Modifier.padding(TcSpacing.sp3)) {
            Text(stringResource(R.string.auctions_lot_number, lot.lotNumber), style = MaterialTheme.typography.labelSmall, color = TcColors.TextMuted)
            Text(lot.title, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            Spacer(Modifier.height(2.dp))
            Text(
                if (lot.currentBid != null) stringResource(R.string.auctions_current_bid) else stringResource(R.string.auctions_initial_bid),
                style = MaterialTheme.typography.labelSmall, color = TcColors.TextLight
            )
            Text(formatPrice(lot.effectiveCurrentBid, "BRL"), style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.ExtraBold), color = TcColors.Primary)
        }
    }
}

@Composable
fun LotBidSheetContent(
    lot: AuctionLot,
    step: Double,
    state: AuctionEventState,
    pendingBidAmount: Double?,
    manualBidText: String,
    bidding: Boolean,
    bidErrorMessage: String?,
    onManualBidTextChange: (String) -> Unit,
    onRequestBid: (Double) -> Unit,
    onRequestManualBid: () -> Unit,
    onConfirmBid: () -> Unit,
    onCancelPendingBid: () -> Unit,
) {
    val currentBid = lot.effectiveCurrentBid
    val minValid = lot.minValidBid(step)
    val increments = remember(currentBid, step) { bidIncrements(currentBid, step) }

    Column(Modifier.padding(TcSpacing.sp4).padding(bottom = TcSpacing.sp6)) {
        Text(stringResource(R.string.auctions_lot_header, lot.lotNumber, lot.title), style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(TcSpacing.sp3))
        Text(stringResource(R.string.auctions_current_bid), style = MaterialTheme.typography.labelSmall, color = TcColors.TextMuted)
        Text(formatPrice(currentBid, "BRL"), style = MaterialTheme.typography.headlineMedium, color = TcColors.Primary)
        Spacer(Modifier.height(TcSpacing.sp4))

        bidErrorMessage?.let {
            Text(it, color = TcColors.Error, style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.height(TcSpacing.sp2))
        }

        when {
            pendingBidAmount != null -> {
                Text(stringResource(R.string.auctions_confirm_bid_question, formatPrice(pendingBidAmount, "BRL")), fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(TcSpacing.sp3))
                Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2)) {
                    Button(onClick = onConfirmBid, enabled = !bidding, colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary)) {
                        Text(if (bidding) stringResource(R.string.common_sending) else stringResource(R.string.common_confirm))
                    }
                    OutlinedButton(onClick = onCancelPendingBid, enabled = !bidding) { Text(stringResource(R.string.common_cancel)) }
                }
            }
            state == AuctionEventState.CANCELLED -> Text(stringResource(R.string.auctions_cancelled_notice), color = TcColors.Error)
            state == AuctionEventState.CLOSED -> Text(stringResource(R.string.auctions_closed_notice), color = TcColors.TextMuted)
            state != AuctionEventState.LIVE -> Text(stringResource(R.string.auctions_not_live_notice), color = TcColors.Warning)
            else -> {
                Text(stringResource(R.string.auctions_quick_bids), fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(TcSpacing.sp2))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2), verticalArrangement = Arrangement.spacedBy(TcSpacing.sp2)) {
                    increments.forEach { inc ->
                        val bidAmount = currentBid + inc
                        OutlinedButton(onClick = { onRequestBid(bidAmount) }, enabled = !bidding) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(stringResource(R.string.auctions_quick_bid_increment, formatPrice(inc, "BRL")), fontSize = 13.sp)
                                Text(stringResource(R.string.auctions_quick_bid_result, formatPrice(bidAmount, "BRL")), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(TcSpacing.sp4))
                Text(stringResource(R.string.auctions_or_manual_bid), fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.height(TcSpacing.sp2))
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2)) {
                    OutlinedTextField(
                        value = manualBidText,
                        onValueChange = onManualBidTextChange,
                        placeholder = { Text(stringResource(R.string.auctions_min_placeholder, formatPrice(minValid, "BRL"))) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        enabled = !bidding,
                        modifier = Modifier.weight(1f)
                    )
                    Button(onClick = onRequestManualBid, enabled = !bidding) { Text(stringResource(R.string.auctions_place_bid)) }
                }
                Spacer(Modifier.height(TcSpacing.sp1))
                Text(stringResource(R.string.auctions_min_valid_bid, formatPrice(minValid, "BRL")), style = MaterialTheme.typography.bodySmall, color = TcColors.TextLight)
            }
        }
    }
}

@Composable
fun CountdownText(targetIso: String, onExpire: () -> Unit, modifier: Modifier = Modifier) {
    var now by remember { mutableStateOf(Instant.now()) }
    val target = remember(targetIso) { runCatching { Instant.parse(targetIso) }.getOrNull() }
    var expired by remember(targetIso) { mutableStateOf(false) }

    LaunchedEffect(targetIso) {
        while (true) {
            now = Instant.now()
            if (target != null && !expired && !now.isBefore(target)) {
                expired = true
                onExpire()
            }
            delay(1000)
        }
    }

    if (target == null) return
    val diff = Duration.between(now, target)
    if (diff.isNegative || diff.isZero) {
        Text(stringResource(R.string.auctions_countdown_starting), modifier = modifier, color = Color.White)
        return
    }
    val d = diff.toDays(); val h = diff.toHoursPart(); val m = diff.toMinutesPart(); val s = diff.toSecondsPart()
    Text("${d}d ${h}h ${m}m ${s}s", modifier = modifier, color = Color.White, fontWeight = FontWeight.Bold)
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun YoutubeEmbed(youtubeUrlOrId: String, modifier: Modifier = Modifier) {
    val videoId = remember(youtubeUrlOrId) {
        Regex("(?:v=|youtu\\.be/|embed/)([\\w-]+)").find(youtubeUrlOrId)?.groupValues?.get(1) ?: youtubeUrlOrId
    }
    AndroidView(
        modifier = modifier.fillMaxWidth().aspectRatio(16f / 9f),
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.mediaPlaybackRequiresUserGesture = false
                webChromeClient = WebChromeClient()
                loadUrl("https://www.youtube.com/embed/$videoId?autoplay=1&mute=1")
            }
        }
    )
}
