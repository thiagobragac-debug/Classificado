package br.com.tauzeclass.mobile.feature.myads

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.AdCard
import br.com.tauzeclass.mobile.feature.ads.AdCardSkeletonItem
import br.com.tauzeclass.mobile.feature.ads.formatRelativeTime
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.feature.listagem.PaginationRow
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import kotlinx.coroutines.launch

@Composable
fun MyAdsTab(onEditAd: (String) -> Unit, viewModel: MyAdsViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val filter by viewModel.filter.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    var adPendingDelete by remember { mutableStateOf<MyAd?>(null) }

    LaunchedEffect(viewModel) {
        viewModel.events.collect { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
    }

    Box(Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize()) {
            ScrollableTabRow(selectedTabIndex = filter.ordinal, edgePadding = TcSpacing.sp4, containerColor = TcColors.Bg, contentColor = TcColors.Primary) {
                AdStatusFilter.entries.forEach { f ->
                    Tab(selected = filter == f, onClick = { viewModel.onFilterChange(f) }, text = { Text(filterLabel(f)) })
                }
            }
            when (val state = uiState) {
                MyAdsUiState.Loading -> LazyColumn(contentPadding = PaddingValues(TcSpacing.sp4)) {
                    items(3) { AdCardSkeletonItem(Modifier.padding(bottom = TcSpacing.sp4)) }
                }
                is MyAdsUiState.Error -> ErrorState(state.message, viewModel::retry)
                is MyAdsUiState.Content -> {
                    if (state.ads.isEmpty()) {
                        Box(Modifier.fillMaxSize().padding(TcSpacing.sp8), contentAlignment = Alignment.Center) {
                            Text(stringResource(R.string.myads_empty_for_filter), color = TcColors.TextMuted)
                        }
                    } else {
                        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = TcSpacing.sp6)) {
                            items(state.ads, key = { it.id }) { ad ->
                                Column(Modifier.padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)) {
                                    MyAdStatusRow(ad)
                                    Spacer(Modifier.height(TcSpacing.sp1))
                                    AdCard(ad = ad.toAdCardModel(), onClick = { onEditAd(ad.id) })
                                    Spacer(Modifier.height(TcSpacing.sp2))
                                    MyAdActionsRow(
                                        ad = ad,
                                        onEdit = { onEditAd(ad.id) },
                                        onTogglePause = { viewModel.onTogglePause(ad) },
                                        onDelete = { adPendingDelete = ad }
                                    )
                                }
                            }
                            item {
                                PaginationRow(
                                    page = state.page, totalPages = state.totalPages, total = state.total,
                                    onPrevious = { viewModel.onPageChange(state.page - 1) },
                                    onNext = { viewModel.onPageChange(state.page + 1) }
                                )
                            }
                        }
                    }
                }
            }
        }
        SnackbarHost(hostState = snackbarHostState, modifier = Modifier.align(Alignment.BottomCenter))
    }

    adPendingDelete?.let { ad ->
        AlertDialog(
            onDismissRequest = { adPendingDelete = null },
            title = { Text(stringResource(R.string.myads_delete_dialog_title)) },
            text = { Text(stringResource(R.string.myads_delete_dialog_body, ad.titlePt)) },
            confirmButton = {
                TextButton(onClick = { viewModel.onDelete(ad); adPendingDelete = null }) { Text(stringResource(R.string.myads_delete), color = TcColors.Error) }
            },
            dismissButton = { TextButton(onClick = { adPendingDelete = null }) { Text(stringResource(R.string.common_cancel)) } }
        )
    }
}

@Composable
private fun MyAdStatusRow(ad: MyAd) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier.background(statusColor(ad.status).copy(alpha = 0.12f), TcShape.Chip)
                .padding(horizontal = 10.dp, vertical = 4.dp)
        ) {
            Text(statusLabel(ad.status), color = statusColor(ad.status), style = MaterialTheme.typography.labelSmall)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.Visibility, contentDescription = null, tint = TcColors.TextMuted, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(4.dp))
            Text("${ad.viewsCount}", style = MaterialTheme.typography.labelSmall, color = TcColors.TextMuted)
            Spacer(Modifier.width(TcSpacing.sp2))
            Text(formatRelativeTime(ad.createdAt), style = MaterialTheme.typography.labelSmall, color = TcColors.TextMuted)
        }
    }
}

@Composable
private fun MyAdActionsRow(ad: MyAd, onEdit: () -> Unit, onTogglePause: () -> Unit, onDelete: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2)) {
        TextButton(onClick = onEdit) { Text(stringResource(R.string.myads_edit)) }
        if (ad.status == "active" || ad.status == "paused") {
            TextButton(onClick = onTogglePause) { Text(if (ad.status == "paused") stringResource(R.string.myads_reactivate) else stringResource(R.string.myads_pause)) }
        }
        TextButton(onClick = onDelete) { Text(stringResource(R.string.myads_delete), color = TcColors.Error) }
    }
}

/** Rótulo do filtro/tab — mapeado aqui (não no enum) porque só um Composable tem Context pra stringResource(). */
@Composable
private fun filterLabel(filter: AdStatusFilter): String = when (filter) {
    AdStatusFilter.ALL -> stringResource(R.string.listagem_all_male)
    AdStatusFilter.ACTIVE -> stringResource(R.string.myads_filter_active)
    AdStatusFilter.PENDING -> stringResource(R.string.myads_filter_pending)
    AdStatusFilter.PAUSED -> stringResource(R.string.myads_filter_paused)
    AdStatusFilter.EXPIRED -> stringResource(R.string.myads_filter_expired)
}

/** Rótulo do badge de status — mesmo motivo do filterLabel acima; chave distinta de myads_filter_pending mesmo com o mesmo texto PT ("Em análise"). */
@Composable
private fun statusLabel(status: String): String = when (status) {
    "active" -> stringResource(R.string.myads_status_active)
    "pending" -> stringResource(R.string.myads_status_pending)
    "paused" -> stringResource(R.string.myads_status_paused)
    "expired" -> stringResource(R.string.myads_status_expired)
    "draft" -> stringResource(R.string.myads_status_draft)
    "deleted" -> stringResource(R.string.myads_status_deleted)
    "rejected" -> stringResource(R.string.myads_status_rejected)
    else -> status
}

private fun statusColor(status: String) = when (status) {
    "active" -> TcColors.Success
    "pending" -> TcColors.Warning
    "paused" -> TcColors.TextMuted
    "expired", "deleted", "rejected" -> TcColors.Error
    else -> TcColors.TextLight
}
