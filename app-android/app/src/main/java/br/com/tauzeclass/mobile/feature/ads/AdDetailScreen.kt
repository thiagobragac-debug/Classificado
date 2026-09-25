package br.com.tauzeclass.mobile.feature.ads

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
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
fun AdDetailScreen(
    onBackClick: () -> Unit,
    onSellerClick: (String) -> Unit = {},
    onMessageSellerClick: (adId: String, sellerId: String, sellerName: String, adTitle: String) -> Unit = { _, _, _, _ -> },
    viewModel: AdDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    // Hoisted aqui (não pode chamar stringResource dentro do lambda onMessageSellerClick abaixo,
    // que é um `() -> Unit` comum, não @Composable).
    val sellerFallbackName = stringResource(R.string.ads_detail_seller_fallback)
    val listState = rememberLazyListState()
    val scrolled by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 || listState.firstVisibleItemScrollOffset > 400 } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { if (scrolled) Text(stringResource(R.string.messages_ad_fallback)) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = if (scrolled) TcColors.Surface else Color.Transparent
                ),
                navigationIcon = {
                    CircularIconButton(onClick = onBackClick, showBackdrop = !scrolled) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back))
                    }
                },
                actions = {
                    (uiState as? AdDetailUiState.Content)?.let { content ->
                        CircularIconButton(onClick = viewModel::onFavoriteToggle, showBackdrop = !scrolled) {
                            Icon(
                                imageVector = if (content.isFavorited) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                                contentDescription = if (content.isFavorited) stringResource(R.string.ads_remove_favorite) else stringResource(R.string.ads_add_favorite),
                                tint = if (content.isFavorited) TcColors.Error else LocalContentColor.current
                            )
                        }
                    }
                },
                modifier = if (scrolled) Modifier.tcShadow(TcShadow.HeaderScrolled) else Modifier
            )
        }
    ) { innerPadding ->
        when (val state = uiState) {
            AdDetailUiState.Loading -> Box(Modifier.fillMaxSize().padding(innerPadding), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = TcColors.Primary)
            }
            AdDetailUiState.NotFound -> FullScreenMessage(
                modifier = Modifier.padding(innerPadding),
                message = stringResource(R.string.ads_detail_not_found),
                actionLabel = stringResource(R.string.common_back),
                onAction = onBackClick
            )
            is AdDetailUiState.Error -> FullScreenMessage(
                modifier = Modifier.padding(innerPadding),
                message = state.message,
                actionLabel = stringResource(R.string.common_retry),
                onAction = viewModel::retry
            )
            is AdDetailUiState.Content -> AdDetailContent(
                state = state,
                listState = listState,
                topPadding = innerPadding.calculateTopPadding(),
                onSellerClick = onSellerClick,
                onContactSellerClick = {
                    viewModel.onContactSellerClick { whatsappUrl ->
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(whatsappUrl)))
                    }
                },
                onMessageSellerClick = {
                    onMessageSellerClick(state.ad.id, state.ad.userId, state.ad.profiles?.name ?: sellerFallbackName, state.ad.displayTitle(spanish = false))
                }
            )
        }
    }
}

@Composable
private fun CircularIconButton(onClick: () -> Unit, showBackdrop: Boolean, content: @Composable () -> Unit) {
    Box(
        modifier = Modifier.padding(4.dp).size(40.dp)
            .let { if (showBackdrop) it.tcShadow(TcShadow.FavButton, CircleShape).background(Color.White.copy(alpha = 0.85f), CircleShape) else it },
        contentAlignment = Alignment.Center
    ) { IconButton(onClick = onClick, content = content) }
}

@Composable
private fun FullScreenMessage(message: String, actionLabel: String, onAction: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(TcSpacing.sp6), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(TcSpacing.sp3))
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

@Composable
private fun AdDetailContent(
    state: AdDetailUiState.Content,
    listState: LazyListState,
    topPadding: Dp,
    onSellerClick: (String) -> Unit,
    onContactSellerClick: () -> Unit,
    onMessageSellerClick: () -> Unit
) {
    val ad = state.ad
    // capturado fora do buildString abaixo: LocalContext.current é @Composable, buildString{} não é.
    val priceContext = LocalContext.current
    LazyColumn(modifier = Modifier.fillMaxSize(), state = listState, contentPadding = PaddingValues(bottom = TcSpacing.sp6)) {
        if (ad.images.isNotEmpty()) {
            item { ImageCarousel(images = ad.images, title = ad.titlePt) }
        } else {
            item { Spacer(Modifier.height(topPadding)) }
        }

        item {
            Column(modifier = Modifier.padding(TcSpacing.sp4)) {
                Text(
                    ad.displayTitle(spanish = false),
                    style = MaterialTheme.typography.headlineSmall.copy(
                        fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 24.sp
                    )
                )
                Spacer(Modifier.height(TcSpacing.sp2))
                // FlowRow (não Row) — o preço em 32sp já quase preenche a largura
                // disponível; um Row simples espremia o chip "Negociável" numa
                // coluna de 1 caractere de largura (mesmo bug do AdCard, corrigido
                // do mesmo jeito: deixar o chip pular inteiro pra linha de baixo).
                FlowRow(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(
                        buildString {
                            append(formatPrice(ad.price, ad.currency, priceContext))
                            ad.priceUnitPt?.let { append(" /$it") }
                        },
                        style = MaterialTheme.typography.titleLarge.copy(
                            fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp
                        ),
                        color = TcColors.Text
                    )
                    if (ad.negotiable) {
                        Box(
                            Modifier.align(Alignment.CenterVertically)
                                .background(Color(0xFFDCFCE7), TcShape.Chip)
                                .padding(horizontal = 10.dp, vertical = 4.dp)
                        ) {
                            Text(stringResource(R.string.ads_negotiable), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TcColors.Success, softWrap = false)
                        }
                    }
                }

                ad.city?.let { city ->
                    Spacer(Modifier.height(TcSpacing.sp2))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TcColors.TextMuted, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(4.dp))
                        Text(listOfNotNull(city, ad.state).joinToString(", "), style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted)
                    }
                }

                HorizontalDivider(color = TcColors.BorderLight, thickness = 1.dp, modifier = Modifier.padding(vertical = TcSpacing.sp6))

                ad.profiles?.name?.let { sellerName ->
                    Text(stringResource(R.string.ads_detail_seller_label), style = MaterialTheme.typography.labelMedium, color = TcColors.TextMuted)
                    Spacer(Modifier.height(TcSpacing.sp2))
                    Surface(
                        color = TcColors.BgAlt,
                        shape = TcShape.CategoryCard,
                        onClick = { ad.profiles.slugOrId?.let(onSellerClick) },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(Modifier.padding(TcSpacing.sp4), verticalAlignment = Alignment.CenterVertically) {
                            Box(
                                Modifier.size(40.dp).clip(CircleShape).background(TcGradient.AvatarFallback),
                                contentAlignment = Alignment.Center
                            ) {
                                if (ad.profiles.avatarUrl != null) {
                                    AsyncImage(
                                        model = ad.profiles.avatarUrl,
                                        contentDescription = sellerName,
                                        contentScale = ContentScale.Crop,
                                        modifier = Modifier.fillMaxSize().clip(CircleShape)
                                    )
                                } else {
                                    Text(sellerName.take(1).uppercase(), color = Color.White, fontWeight = FontWeight.Bold)
                                }
                            }
                            Spacer(Modifier.width(TcSpacing.sp3))
                            Column {
                                Text(sellerName, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
                                if (ad.profiles.verified) {
                                    Spacer(Modifier.height(2.dp))
                                    VerifiedBadge()
                                }
                            }
                        }
                    }
                    HorizontalDivider(color = TcColors.BorderLight, thickness = 1.dp, modifier = Modifier.padding(vertical = TcSpacing.sp6))
                }

                ad.description?.let { description ->
                    Surface(color = TcColors.Surface, shape = TcShape.CategoryCard, border = BorderStroke(1.dp, TcColors.BorderLight), modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(TcSpacing.sp4)) {
                            Text(stringResource(R.string.ads_detail_description), style = MaterialTheme.typography.labelMedium, color = TcColors.TextMuted)
                            Spacer(Modifier.height(TcSpacing.sp2))
                            Text(description, style = MaterialTheme.typography.bodyMedium, color = TcColors.Text)
                        }
                    }
                    Spacer(Modifier.height(TcSpacing.sp6))
                }

                state.contactMessage?.let { message ->
                    Row(
                        modifier = Modifier.fillMaxWidth()
                            .background(TcColors.Error.copy(alpha = 0.08f), TcShape.CategoryIcon)
                            .border(1.dp, TcColors.Error.copy(alpha = 0.3f), TcShape.CategoryIcon)
                            .padding(TcSpacing.sp3),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.ErrorOutline, contentDescription = null, tint = TcColors.Error, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(TcSpacing.sp2))
                        Text(message, style = MaterialTheme.typography.bodySmall, color = TcColors.Error)
                    }
                    Spacer(Modifier.height(TcSpacing.sp2))
                }

                Button(
                    onClick = onContactSellerClick,
                    enabled = !state.contactLoading,
                    shape = RoundedCornerShape(16.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366), contentColor = Color.White),
                    modifier = Modifier.fillMaxWidth().height(52.dp)
                        .tcShadow(if (state.contactLoading) TcShadow.WhatsappHover else TcShadow.Whatsapp, RoundedCornerShape(16.dp))
                ) {
                    if (!state.contactLoading) {
                        Icon(painterResource(R.drawable.ic_whatsapp), contentDescription = null, tint = Color.Unspecified, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(if (state.contactLoading) stringResource(R.string.ads_detail_fetching_contact) else stringResource(R.string.ads_detail_contact_seller))
                }

                Spacer(Modifier.height(TcSpacing.sp2))
                OutlinedButton(
                    onClick = onMessageSellerClick,
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, TcColors.Border),
                    modifier = Modifier.fillMaxWidth().height(52.dp)
                ) {
                    Icon(Icons.Filled.Email, contentDescription = null, tint = TcColors.Primary, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.ads_detail_send_message), color = TcColors.Primary, fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun ImageCarousel(images: List<String>, title: String) {
    val pagerState = rememberPagerState(pageCount = { images.size })
    Box {
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxWidth()) { page ->
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(images[page]).crossfade(300).build(),
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
                loading = { AdImageSkeleton(Modifier.fillMaxSize()) }
            )
        }
        if (images.size > 1) {
            Row(
                Modifier.align(Alignment.BottomCenter).padding(bottom = TcSpacing.sp3),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                repeat(images.size) { i ->
                    val active = pagerState.currentPage == i
                    Box(
                        Modifier.size(if (active) 8.dp else 6.dp)
                            .background(if (active) TcColors.Primary else Color.White.copy(alpha = 0.6f), CircleShape)
                    )
                }
            }
            Box(
                Modifier.align(Alignment.TopEnd).padding(TcSpacing.sp3)
                    .background(Color.Black.copy(alpha = 0.5f), TcShape.Pill).padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text("${pagerState.currentPage + 1}/${images.size}", color = Color.White, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}
