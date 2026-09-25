package br.com.tauzeclass.mobile.feature.home

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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Inbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.Ad
import br.com.tauzeclass.mobile.feature.ads.AdCard
import br.com.tauzeclass.mobile.feature.ads.AdCardSkeletonItem
import br.com.tauzeclass.mobile.feature.auctions.AuctionCard
import br.com.tauzeclass.mobile.feature.auctions.AuctionEvent
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.feature.events.EventCard
import br.com.tauzeclass.mobile.feature.events.EventoAgro
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onAdClick: (Ad) -> Unit = {},
    onSeeAllClick: () -> Unit = {},
    onSearchSubmit: (query: String, categoriaId: String?) -> Unit = { _, _ -> },
    onCategoriaClick: (String) -> Unit = {},
    onAnunciarClick: () -> Unit = {},
    onSeeAllAuctionsClick: () -> Unit = {},
    onAuctionClick: (AuctionEvent) -> Unit = {},
    onSeeAllEventsClick: () -> Unit = {},
    onEventClick: (EventoAgro) -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var refreshing by remember { mutableStateOf(false) }

    LaunchedEffect(uiState) {
        if (uiState !is HomeUiState.Loading) refreshing = false
    }

    PullToRefreshBox(
        isRefreshing = refreshing,
        onRefresh = { refreshing = true; viewModel.load() },
        modifier = Modifier.fillMaxSize()
    ) {
        when (val state = uiState) {
            HomeUiState.Loading -> HomeLoadingSkeleton()
            is HomeUiState.Error -> ErrorState(message = state.message, onRetry = viewModel::load)
            is HomeUiState.Content -> HomeContent(
                state, onAdClick, onSeeAllClick, onSearchSubmit, onCategoriaClick, onAnunciarClick,
                viewModel::onFavoriteToggle, onSeeAllAuctionsClick, onAuctionClick, onSeeAllEventsClick, onEventClick
            )
        }
    }
}

@Composable
private fun HomeLoadingSkeleton() {
    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(top = TcSpacing.sp2, bottom = TcSpacing.sp6)) {
        item {
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3),
                contentPadding = PaddingValues(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp3)
            ) {
                items(3) { AdCardSkeletonItem(Modifier.width(200.dp)) }
            }
        }
        items(4) { AdCardSkeletonItem(Modifier.padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)) }
    }
}

@Composable
private fun HomeContent(
    state: HomeUiState.Content,
    onAdClick: (Ad) -> Unit,
    onSeeAllClick: () -> Unit,
    onSearchSubmit: (query: String, categoriaId: String?) -> Unit,
    onCategoriaClick: (String) -> Unit,
    onAnunciarClick: () -> Unit,
    onFavoriteToggle: (String) -> Unit,
    onSeeAllAuctionsClick: () -> Unit,
    onAuctionClick: (AuctionEvent) -> Unit,
    onSeeAllEventsClick: () -> Unit,
    onEventClick: (EventoAgro) -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = TcSpacing.sp6)
    ) {
        item {
            HomeHeroSection(
                userDisplayName = state.userDisplayName,
                stats = state.stats,
                categories = state.categories,
                onSearchSubmit = onSearchSubmit,
                onCategoriaClick = onCategoriaClick,
                onAnunciarClick = onAnunciarClick,
            )
        }

        if (state.liveAuctions.isNotEmpty()) {
            item {
                SectionHeader(stringResource(R.string.home_section_live_auctions), onSeeAllClick = onSeeAllAuctionsClick)
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3),
                    contentPadding = PaddingValues(horizontal = TcSpacing.sp4)
                ) {
                    items(state.liveAuctions, key = { it.id }) { event ->
                        AuctionCard(event, onClick = { onAuctionClick(event) }, modifier = Modifier.width(240.dp))
                    }
                }
            }
            item {
                HorizontalDivider(color = TcColors.BorderLight, thickness = 1.dp, modifier = Modifier.padding(vertical = TcSpacing.sp2))
            }
        }

        if (state.upcomingEvents.isNotEmpty()) {
            item {
                SectionHeader(stringResource(R.string.home_section_upcoming_events), onSeeAllClick = onSeeAllEventsClick)
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3),
                    contentPadding = PaddingValues(horizontal = TcSpacing.sp4)
                ) {
                    items(state.upcomingEvents, key = { it.id }) { event ->
                        EventCard(event, onClick = { onEventClick(event) }, modifier = Modifier.width(240.dp))
                    }
                }
            }
            item {
                HorizontalDivider(color = TcColors.BorderLight, thickness = 1.dp, modifier = Modifier.padding(vertical = TcSpacing.sp2))
            }
        }

        if (state.featuredAds.isNotEmpty()) {
            item {
                SectionHeader(stringResource(R.string.home_section_featured), onSeeAllClick = onSeeAllClick)
                LazyRow(
                    horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3),
                    contentPadding = PaddingValues(horizontal = TcSpacing.sp4)
                ) {
                    items(state.featuredAds, key = { it.id }) { ad ->
                        AdCard(
                            ad = ad,
                            onClick = { onAdClick(ad) },
                            modifier = Modifier.width(200.dp),
                            isFavorited = state.favoriteAdIds.contains(ad.id),
                            onFavoriteClick = { onFavoriteToggle(ad.id) }
                        )
                    }
                }
            }
            item {
                HorizontalDivider(
                    color = TcColors.BorderLight,
                    thickness = 1.dp,
                    modifier = Modifier.padding(vertical = TcSpacing.sp2)
                )
            }
        }

        item {
            Box(Modifier.fillMaxWidth().background(TcColors.BgAlt)) {
                SectionHeader(stringResource(R.string.home_section_recent), onSeeAllClick = onSeeAllClick)
            }
        }

        if (state.recentAds.isEmpty()) {
            item {
                Column(
                    modifier = Modifier.fillMaxWidth().background(TcColors.BgAlt).padding(TcSpacing.sp8),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(Icons.Outlined.Inbox, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.height(TcSpacing.sp2))
                    Text(stringResource(R.string.home_recent_empty), color = TcColors.TextMuted, style = MaterialTheme.typography.bodyMedium)
                }
            }
        } else {
            items(state.recentAds, key = { it.id }) { ad ->
                Box(Modifier.fillMaxWidth().background(TcColors.BgAlt)) {
                    AdCard(
                        ad = ad,
                        onClick = { onAdClick(ad) },
                        modifier = Modifier.padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2),
                        isFavorited = state.favoriteAdIds.contains(ad.id),
                        onFavoriteClick = { onFavoriteToggle(ad.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String, onSeeAllClick: (() -> Unit)? = null) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp3),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, style = MaterialTheme.typography.headlineSmall)
        if (onSeeAllClick != null) {
            TextButton(onClick = onSeeAllClick) {
                Text(stringResource(R.string.home_see_all), style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = TcColors.Primary)
            }
        }
    }
}
