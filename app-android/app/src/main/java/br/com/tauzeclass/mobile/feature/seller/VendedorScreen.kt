package br.com.tauzeclass.mobile.feature.seller

import android.content.Intent
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.SearchOff
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
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.Ad
import br.com.tauzeclass.mobile.feature.ads.AdCard
import br.com.tauzeclass.mobile.feature.listagem.PaginationRow
import br.com.tauzeclass.mobile.feature.listagem.ResultsGrid
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.components.VerifiedBadge
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcDisplayFontFamily
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import coil3.compose.AsyncImage
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VendedorScreen(
    onBackClick: () -> Unit,
    onAdClick: (Ad) -> Unit,
    viewModel: VendedorViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val shareProfileTitle = stringResource(R.string.seller_share_profile)

    Scaffold(topBar = {
        TopAppBar(
            title = {},
            navigationIcon = {
                IconButton(onClick = onBackClick) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                }
            },
            actions = {
                (uiState as? VendedorUiState.Content)?.let { content ->
                    IconButton(onClick = {
                        val url = "https://www.tauzeclass.com.br/vendedor/${content.profile.slug ?: content.profile.id}"
                        val intent = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_TEXT, url)
                        }
                        context.startActivity(Intent.createChooser(intent, shareProfileTitle))
                    }) { Icon(Icons.Filled.Share, contentDescription = stringResource(R.string.seller_share)) }
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent)
        )
    }) { padding ->
        when (val state = uiState) {
            VendedorUiState.Loading -> Box(Modifier.fillMaxSize().padding(padding), Alignment.Center) {
                CircularProgressIndicator(color = TcColors.Primary)
            }
            VendedorUiState.NotFound -> FullScreenMessage(stringResource(R.string.seller_not_found), stringResource(R.string.common_back), onBackClick, Modifier.padding(padding))
            is VendedorUiState.Error -> FullScreenMessage(state.message, stringResource(R.string.common_retry), viewModel::retry, Modifier.padding(padding))
            is VendedorUiState.Content -> VendedorContent(
                state = state, topPadding = padding.calculateTopPadding(),
                onAdClick = onAdClick, onFavoriteToggle = viewModel::onFavoriteToggle,
                onPageChange = viewModel::onPageChange, onOpenReview = viewModel::onOpenReview
            )
        }
    }

    (uiState as? VendedorUiState.Content)?.review?.takeIf { it.visible }?.let { review ->
        ReviewBottomSheet(
            review = review,
            onDismiss = viewModel::onDismissReview,
            onRatingChange = viewModel::onRatingChange,
            onCommentChange = viewModel::onCommentChange,
            onSubmit = viewModel::onSubmitReview
        )
    }
}

@Composable
private fun FullScreenMessage(message: String, actionLabel: String, onAction: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(TcSpacing.sp6), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(message, color = TcColors.TextMuted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(TcSpacing.sp4))
            Button(
                onClick = onAction,
                shape = TcShape.Pill,
                colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary),
                modifier = Modifier.tcShadow(TcShadow.Green, TcShape.Pill)
            ) { Text(actionLabel) }
        }
    }
}

/**
 * Uma LazyVerticalGrid só (via ResultsGrid), NÃO uma LazyColumn com a grid
 * aninhada dentro de um item — Compose não permite medir um componente
 * scrollável (a grid) dentro de outro (a coluna) sem altura limitada, gera
 * IllegalStateException em runtime (achado ao vivo: crash real no primeiro
 * teste desta tela). O cabeçalho vira um item de span cheio no topo da
 * própria grid, igual ao rodapé de paginação.
 */
@Composable
private fun VendedorContent(
    state: VendedorUiState.Content, topPadding: Dp, onAdClick: (Ad) -> Unit,
    onFavoriteToggle: (String) -> Unit, onPageChange: (Int) -> Unit, onOpenReview: () -> Unit
) {
    ResultsGrid(content = {
        item(span = { GridItemSpan(maxLineSpan) }) {
            VendedorHeader(state.profile, state.stats, topPadding, onReviewClick = onOpenReview)
        }

        if (state.ads.ads.isEmpty()) {
            item(span = { GridItemSpan(maxLineSpan) }) {
                Column(Modifier.fillMaxWidth().padding(TcSpacing.sp8), horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Outlined.SearchOff, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(40.dp))
                    Spacer(Modifier.height(TcSpacing.sp2))
                    Text(stringResource(R.string.seller_no_active_ads), color = TcColors.TextMuted)
                }
            }
        } else {
            items(state.ads.ads, key = { it.id }) { ad ->
                AdCard(
                    ad = ad,
                    onClick = { onAdClick(ad) },
                    isFavorited = state.favoriteAdIds.contains(ad.id),
                    onFavoriteClick = { onFavoriteToggle(ad.id) }
                )
            }
            item(span = { GridItemSpan(maxLineSpan) }) {
                PaginationRow(
                    page = state.page,
                    totalPages = state.ads.totalPages,
                    total = state.ads.total,
                    onPrevious = { onPageChange(state.page - 1) },
                    onNext = { onPageChange(state.page + 1) }
                )
            }
        }
    })
}

@Composable
private fun VendedorHeader(profile: SellerProfile, stats: SellerStats, topPadding: Dp, onReviewClick: () -> Unit) {
    val context = LocalContext.current
    val displayName = profile.displayNameOrNull ?: stringResource(R.string.seller_anonymous)
    val shareProfileTitle = stringResource(R.string.seller_share_profile)
    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(120.dp + topPadding)) {
            if (profile.bannerUrl != null) {
                SubcomposeAsyncImage(
                    model = ImageRequest.Builder(context).data(profile.bannerUrl).crossfade(300).build(),
                    contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()
                )
                Box(
                    Modifier.fillMaxSize().background(
                        Brush.linearGradient(listOf(Color(0xFF16A34A).copy(alpha = .8f), Color(0xFF064E3B).copy(alpha = .8f)))
                    )
                )
            } else {
                Box(Modifier.fillMaxSize().background(TcGradient.Primary))
            }
        }

        Column(Modifier.fillMaxWidth().offset(y = (-32).dp).padding(horizontal = TcSpacing.sp4)) {
            Box(
                Modifier.size(64.dp).border(3.dp, TcColors.PrimaryPale, CircleShape).clip(CircleShape)
                    .background(TcGradient.AvatarFallback),
                contentAlignment = Alignment.Center
            ) {
                if (profile.avatarUrl != null) {
                    AsyncImage(
                        model = profile.avatarUrl, contentDescription = displayName,
                        contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().clip(CircleShape)
                    )
                } else {
                    Text(displayName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 24.sp)
                }
            }

            Spacer(Modifier.height(TcSpacing.sp2))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(displayName, style = MaterialTheme.typography.titleLarge.copy(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.Bold))
                if (profile.verified) {
                    Spacer(Modifier.width(TcSpacing.sp2))
                    VerifiedBadge()
                }
            }

            Spacer(Modifier.height(TcSpacing.sp4))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
                StatBlock(String.format("%.1f", stats.avgRating), stringResource(R.string.seller_stat_stars))
                StatBlock(stats.totalReviews.toString(), stringResource(R.string.seller_stat_reviews))
                StatBlock(yearsActiveLabel(profile.createdAt), stringResource(R.string.seller_stat_years))
            }

            Spacer(Modifier.height(TcSpacing.sp3))
            Row(verticalAlignment = Alignment.CenterVertically) {
                repeat(5) { i ->
                    val filled = stats.totalReviews > 0 && i < Math.round(stats.avgRating)
                    Icon(Icons.Filled.Star, contentDescription = null, tint = if (filled) TcColors.Accent else TcColors.BorderLight, modifier = Modifier.size(16.dp))
                }
                Spacer(Modifier.width(TcSpacing.sp2))
                Text(
                    if (stats.totalReviews == 0L) stringResource(R.string.seller_no_reviews_yet)
                    else "(${pluralStringResource(R.plurals.seller_reviews_count, stats.totalReviews.toInt(), stats.totalReviews.toInt())}) • Média ${String.format("%.1f", stats.avgRating)}",
                    style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted
                )
            }

            Spacer(Modifier.height(TcSpacing.sp4))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
                OutlinedButton(
                    onClick = {
                        val url = "https://www.tauzeclass.com.br/vendedor/${profile.slug ?: profile.id}"
                        val intent = Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, url) }
                        context.startActivity(Intent.createChooser(intent, shareProfileTitle))
                    },
                    modifier = Modifier.weight(1f), shape = TcShape.Pill,
                    border = BorderStroke(1.dp, TcColors.Border)
                ) {
                    Icon(Icons.Filled.Share, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.seller_share))
                }
                GradientButton(
                    text = stringResource(R.string.seller_evaluate), onClick = onReviewClick,
                    gradient = TcGradient.Primary, shadowLayers = TcShadow.Green,
                    modifier = Modifier.weight(1f), height = 40.dp
                )
            }

            Spacer(Modifier.height(TcSpacing.sp4))
            androidx.compose.material3.HorizontalDivider(color = TcColors.BorderLight)
        }
    }
}

@Composable
private fun StatBlock(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge.copy(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.ExtraBold))
        Text(label, fontSize = 11.sp, color = TcColors.TextMuted)
    }
}

/** floor((now - created_at)/365d): "N+" se N>0, "<1" se 0, "—" se created_at nulo — mesma regra do site. */
private fun yearsActiveLabel(createdAt: String?): String {
    if (createdAt == null) return "—"
    return try {
        val years = java.time.Duration.between(java.time.Instant.parse(createdAt), java.time.Instant.now()).toDays() / 365
        if (years > 0) "$years+" else "<1"
    } catch (e: Exception) {
        "—"
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReviewBottomSheet(
    review: ReviewDialogState, onDismiss: () -> Unit,
    onRatingChange: (Int) -> Unit, onCommentChange: (String) -> Unit, onSubmit: () -> Unit
) {
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.fillMaxWidth().padding(TcSpacing.sp5).padding(bottom = TcSpacing.sp6)) {
            Text(stringResource(R.string.seller_review_modal_title), style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
            Spacer(Modifier.height(TcSpacing.sp4))

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                (1..5).forEach { star ->
                    IconButton(onClick = { onRatingChange(star) }) {
                        Icon(
                            Icons.Filled.Star, contentDescription = pluralStringResource(R.plurals.seller_star_rating_cd, star, star),
                            tint = if (star <= review.rating) TcColors.Accent else TcColors.BorderLight,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            }
            Spacer(Modifier.height(TcSpacing.sp4))

            OutlinedTextField(
                value = review.comment, onValueChange = onCommentChange,
                label = { Text(stringResource(R.string.seller_review_comment)) },
                supportingText = { Text("${review.comment.length}/500") },
                minLines = 3, maxLines = 5,
                shape = TcShape.Input,
                modifier = Modifier.fillMaxWidth()
            )

            review.errorMessage?.let { msg ->
                Spacer(Modifier.height(TcSpacing.sp2))
                Text(msg, color = TcColors.Error, style = MaterialTheme.typography.bodySmall)
            }

            Spacer(Modifier.height(TcSpacing.sp4))
            GradientButton(
                text = if (review.submitting) stringResource(R.string.common_sending) else stringResource(R.string.seller_send_review),
                onClick = onSubmit, loading = review.submitting,
                gradient = TcGradient.Primary, shadowLayers = TcShadow.Green,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}
