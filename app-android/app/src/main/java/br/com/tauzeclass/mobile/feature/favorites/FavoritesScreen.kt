package br.com.tauzeclass.mobile.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.Ad
import br.com.tauzeclass.mobile.feature.ads.AdCard
import br.com.tauzeclass.mobile.feature.ads.AdCardSkeletonItem
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow

@Composable
fun FavoritesScreen(
    onAdClick: (Ad) -> Unit = {},
    onExploreClick: () -> Unit = {},
    viewModel: FavoritesViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    when (val state = uiState) {
        FavoritesUiState.Loading -> LazyColumn(Modifier.fillMaxSize()) {
            items(4) { AdCardSkeletonItem(Modifier.padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)) }
        }
        is FavoritesUiState.Error -> ErrorState(message = state.message, onRetry = viewModel::load)
        is FavoritesUiState.Content -> {
            if (state.favoriteAds.isEmpty()) {
                Column(
                    modifier = Modifier.fillMaxSize().padding(TcSpacing.sp8),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center
                ) {
                    Icon(Icons.Outlined.FavoriteBorder, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(64.dp))
                    Spacer(Modifier.height(TcSpacing.sp4))
                    Text(
                        stringResource(R.string.favorites_empty_title),
                        style = MaterialTheme.typography.titleMedium,
                        color = TcColors.TextMuted,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(TcSpacing.sp2))
                    Text(
                        stringResource(R.string.favorites_empty_desc),
                        style = MaterialTheme.typography.bodyMedium,
                        color = TcColors.TextLight,
                        textAlign = TextAlign.Center
                    )
                    Spacer(Modifier.height(TcSpacing.sp6))
                    Button(
                        onClick = onExploreClick,
                        shape = TcShape.Pill,
                        colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary),
                        modifier = Modifier.tcShadow(TcShadow.Green, TcShape.Pill)
                    ) {
                        Icon(Icons.Filled.Search, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.favorites_explore))
                    }
                }
            } else {
                LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = TcSpacing.sp6)) {
                    item {
                        Text(
                            pluralStringResource(R.plurals.favorites_count, state.favoriteAds.size, state.favoriteAds.size),
                            style = MaterialTheme.typography.labelLarge,
                            color = TcColors.TextMuted,
                            modifier = Modifier.padding(TcSpacing.sp4)
                        )
                    }
                    items(state.favoriteAds, key = { it.id }) { ad ->
                        AdCard(
                            ad = ad,
                            onClick = { onAdClick(ad) },
                            modifier = Modifier.padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2),
                            isFavorited = true,
                            onFavoriteClick = { viewModel.onRemoveFavorite(ad.id) }
                        )
                    }
                }
            }
        }
    }
}
