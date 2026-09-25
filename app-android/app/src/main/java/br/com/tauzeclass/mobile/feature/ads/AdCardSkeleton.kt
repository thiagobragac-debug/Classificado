package br.com.tauzeclass.mobile.feature.ads

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing

/**
 * Placeholder "shimmer" reutilizado como imagem de anúncio em loading (AdCard)
 * e como barra de texto no skeleton do card inteiro (AdCardSkeletonItem).
 * Mesma duração/curva de --skeleton-loading do site (1.4s linear, globals.css:1276).
 */
@Composable
fun AdImageSkeleton(modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "skeleton")
    val translate by transition.animateFloat(
        initialValue = -500f,
        targetValue = 1000f,
        animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing)),
        label = "skeleton-x"
    )
    val brush = Brush.linearGradient(
        colors = listOf(TcColors.BgAlt, TcColors.SurfaceAlt, TcColors.BgAlt),
        start = Offset(translate, 0f),
        end = Offset(translate + 500f, 0f)
    )
    Box(modifier.background(brush))
}

/** Skeleton do AdCard inteiro — mesma silhueta (imagem 4:3 + 3 barras), sem sombra. */
@Composable
fun AdCardSkeletonItem(modifier: Modifier = Modifier) {
    Card(
        shape = TcShape.AdCard,
        colors = CardDefaults.cardColors(containerColor = TcColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = modifier.fillMaxWidth()
    ) {
        AdImageSkeleton(Modifier.fillMaxWidth().aspectRatio(4f / 3f))
        Column(Modifier.padding(start = TcSpacing.sp4, end = TcSpacing.sp4, top = TcSpacing.sp4, bottom = TcSpacing.sp5)) {
            AdImageSkeleton(Modifier.fillMaxWidth(0.8f).height(16.dp))
            Spacer(Modifier.height(TcSpacing.sp2))
            AdImageSkeleton(Modifier.width(120.dp).height(20.dp))
            Spacer(Modifier.height(TcSpacing.sp2))
            AdImageSkeleton(Modifier.fillMaxWidth(0.5f).height(12.dp))
        }
    }
}
