package br.com.tauzeclass.mobile.feature.ads

import android.content.Context
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.ImageNotSupported
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.TcBodyFontFamily
import br.com.tauzeclass.mobile.ui.theme.TcCategory
import br.com.tauzeclass.mobile.ui.theme.TcDisplayFontFamily
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Cartão de anúncio reutilizável — usado em Home, Listagem, Vendedor e Favoritos. */
@Composable
fun AdCard(
    ad: Ad,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    isFavorited: Boolean = false,
    onFavoriteClick: (() -> Unit)? = null
) {
    val category = remember(ad.categoryId) { TcCategory.fromCategoryId(ad.categoryId) }
    val cardShape = TcShape.AdCard // 24dp — var(--r-xl), globals.css:1059

    Card(
        onClick = onClick,
        shape = cardShape,
        colors = CardDefaults.cardColors(containerColor = TcColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp), // sombra própria via tcShadow, não somar com a elevação padrão do M3
        border = BorderStroke(
            width = if (ad.featured) 2.dp else 1.dp,
            color = if (ad.featured) TcColors.Accent else TcColors.BorderLight
        ),
        modifier = modifier
            .fillMaxWidth()
            .tcShadow(TcShadow.Card, cardShape) // --shadow-card, globals.css:1060
    ) {
        Box {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(ad.coverImageUrl)
                    .crossfade(300)
                    .build(),
                contentDescription = ad.titlePt,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f),
                loading = { AdImageSkeleton(Modifier.fillMaxSize()) },
                error = {
                    Box(Modifier.fillMaxSize().background(TcColors.BgAlt), contentAlignment = Alignment.Center) {
                        Icon(
                            Icons.Outlined.ImageNotSupported,
                            contentDescription = null,
                            tint = TcColors.TextLight,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            )

            // Badge de categoria — bottom-start, cores dinâmicas por categoria
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .padding(TcSpacing.sp3)
                    .tcShadow(TcShadow.CategoryBadge, TcShape.CategoryIcon)
                    .background(category.bg, TcShape.CategoryIcon)
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            ) {
                Text(
                    text = categoryDisplayNamePt(ad.categoryId),
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontWeight = FontWeight.Bold, fontSize = 11.sp, letterSpacing = 0.5.sp
                    ),
                    color = category.clr,
                    maxLines = 1
                )
            }

            // Selo "Destaque" — top-start, só se featured
            if (ad.featured) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .align(Alignment.TopStart)
                        .padding(TcSpacing.sp3)
                        .tcShadow(TcShadow.FeaturedBadge, TcShape.Pill)
                        .background(TcColors.Accent, TcShape.Pill)
                        .padding(start = 8.dp, end = 10.dp, top = 4.dp, bottom = 4.dp)
                ) {
                    Icon(Icons.Filled.Star, contentDescription = null, tint = Color.White, modifier = Modifier.size(11.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(stringResource(R.string.ads_badge_featured), color = Color.White, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
                }
            }

            // Botão de favorito
            if (onFavoriteClick != null) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(TcSpacing.sp2)
                        .size(34.dp)
                        .tcShadow(TcShadow.FavButton, CircleShape)
                        .background(Color.White.copy(alpha = 0.85f), CircleShape)
                ) {
                    IconButton(onClick = onFavoriteClick, modifier = Modifier.fillMaxSize()) {
                        Icon(
                            imageVector = if (isFavorited) Icons.Filled.Favorite else Icons.Filled.FavoriteBorder,
                            contentDescription = if (isFavorited) stringResource(R.string.ads_remove_favorite) else stringResource(R.string.ads_add_favorite),
                            tint = if (isFavorited) TcColors.Error else TcColors.Primary,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                }
            }
        }

        Column(modifier = Modifier.padding(start = TcSpacing.sp4, end = TcSpacing.sp4, top = TcSpacing.sp4, bottom = TcSpacing.sp5)) {
            // .ad-card__body: padding 16 16 20 — globals.css:1123
            Text(
                text = ad.titlePt,
                style = MaterialTheme.typography.titleSmall.copy(
                    fontFamily = TcBodyFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 16.sp
                ), // Inter 600 1rem — globals.css:1124 (título do card não usa Sora)
                color = TcColors.Text,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(Modifier.height(TcSpacing.sp1))

            // .ad-card__price é flex-wrap no site (globals.css:1125) — a unidade nunca
            // quebra caractere a caractere, ela pula inteira pra linha de baixo quando
            // não cabe. FlowRow reproduz esse comportamento (Row simples espremia o
            // texto da unidade numa coluna de 1 caractere de largura).
            FlowRow(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(0.dp)) {
                Text(
                    text = formatPrice(ad.price, ad.currency, LocalContext.current),
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp
                    ), // Sora 800 — globals.css:1125 (única string do card em Sora)
                    color = TcColors.Text
                )
                ad.priceUnitPt?.let { unit ->
                    Text(
                        "/$unit",
                        style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold),
                        color = TcColors.TextLight,
                        softWrap = false,
                        modifier = Modifier.align(Alignment.CenterVertically)
                    )
                }
            }

            if (ad.negotiable) {
                Spacer(Modifier.height(TcSpacing.sp1))
                Box(
                    modifier = Modifier
                        .background(Color(0xFFDCFCE7), TcShape.Chip) // .ad-tag--success — globals.css:1129
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(stringResource(R.string.ads_negotiable), fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TcColors.Success)
                }
                Spacer(Modifier.height(TcSpacing.sp4))
            } else {
                Spacer(Modifier.height(TcSpacing.sp2))
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                ad.city?.let { city ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TcColors.TextMuted, modifier = Modifier.size(12.dp))
                        Spacer(Modifier.width(2.dp))
                        Text(
                            text = if (ad.state != null) "$city, ${ad.state}" else city,
                            fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TcColors.TextMuted,
                            maxLines = 1, overflow = TextOverflow.Ellipsis
                        )
                    }
                }
                Text(formatRelativeTime(ad.createdAt), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = TcColors.TextMuted)
            }

            ad.profiles?.name?.let { sellerName ->
                Spacer(Modifier.height(TcSpacing.sp1))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = sellerName, style = MaterialTheme.typography.labelSmall,
                        maxLines = 1, overflow = TextOverflow.Ellipsis, color = TcColors.TextMuted
                    )
                    if (ad.profiles.verified) {
                        Spacer(Modifier.width(2.dp))
                        Icon(
                            imageVector = Icons.Filled.Verified, contentDescription = stringResource(R.string.common_verified_badge),
                            tint = TcColors.Primary, modifier = Modifier.size(12.dp)
                        )
                    }
                }
            }
        }
    }
}

/**
 * Mesma lógica de moeda do site: BRL formatado como R$, outras moedas com o código na frente.
 *
 * [context] é opcional (default null) de propósito: esta função tem call sites fora deste
 * lote de arquivos (CheckoutScreen, AuctionDetailScreen/ViewModel, PlansScreen) que não devem
 * ser tocados nesta tarefa. Quando chamada com contexto (AdCard/AdDetailScreen), o fallback de
 * preço nulo usa o recurso ads_price_on_request; sem contexto, mantém o literal PT como estava.
 */
fun formatPrice(price: Double?, currency: String, context: Context? = null): String {
    if (price == null) return context?.getString(R.string.ads_price_on_request) ?: "Preço a combinar"
    return when (currency) {
        "BRL" -> NumberFormat.getCurrencyInstance(Locale.forLanguageTag("pt-BR")).format(price)
        else -> "$currency ${"%.2f".format(price)}"
    }
}

/**
 * Parsing isolado (não-@Composable) de [formatRelativeTime] — o compilador do Compose proíbe
 * chamada de função @Composable dentro do corpo de um try/catch, então o try/catch de parsing
 * precisa ficar fora da função @Composable, num helper puro que devolve o Instant + dias já calculados.
 */
private fun parseRelativeInfo(createdAt: String?): Pair<Instant, Long>? {
    if (createdAt == null) return null
    return try {
        val instant = Instant.parse(createdAt)
        instant to Duration.between(instant, Instant.now()).toDays()
    } catch (e: Exception) {
        null
    }
}

/**
 * Tempo relativo simples (Hoje / Ontem / N dias atrás / data). minSdk 24 ok — desugaring já habilitado.
 *
 * Virou @Composable (em vez de receber um Context) porque todos os call sites já são internos a
 * Composables (AdCard, MyAdsScreen, MessagesScreen) — nenhum precisou mudar de assinatura para isso.
 * Necessário para acessar stringResource/pluralStringResource (ads_days_ago é um <plurals>).
 */
@Composable
fun formatRelativeTime(createdAt: String?): String {
    val (instant, days) = parseRelativeInfo(createdAt) ?: return ""
    return when {
        days <= 0L -> stringResource(R.string.ads_posted_today)
        days == 1L -> stringResource(R.string.ads_posted_yesterday)
        days < 30L -> pluralStringResource(R.plurals.ads_days_ago, days.toInt(), days.toInt())
        else -> DateTimeFormatter.ofPattern("dd/MM/yyyy").withZone(ZoneId.systemDefault()).format(instant)
    }
}
