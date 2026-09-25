package br.com.tauzeclass.mobile.ui.theme

import android.graphics.BlurMaskFilter
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

data class TcShadowLayer(val offsetX: Dp = 0.dp, val offsetY: Dp, val blurRadius: Dp, val color: Color)

/**
 * Modifier equivalente a `box-shadow` do CSS (aceita múltiplas camadas, como
 * o site usa em --shadow-card etc).
 *
 * BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): Paint.setMaskFilter()
 * (usado abaixo via BlurMaskFilter) está documentado pela própria Android
 * como não suportado em canvas com aceleração de hardware — sem isso, o
 * blur provavelmente não renderizava em quase toda a UI (GradientButton,
 * cards, badges), desenhando só uma silhueta sólida deslocada. Compositar
 * numa camada offscreen (graphicsLayer + CompositingStrategy.Offscreen)
 * força esse trecho de desenho a rodar via software layer, onde o
 * maskFilter funciona corretamente — sem precisar desativar HW acceleration
 * da Activity inteira (o que penalizaria toda a performance de renderização
 * do app) nem exigir API 31+ (RenderEffect, a alternativa nativa mais nova).
 */
fun Modifier.tcShadow(layers: List<TcShadowLayer>, shape: Shape = RectangleShape): Modifier = this
    .graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
    .drawBehind {
    val outline = shape.createOutline(size, layoutDirection, this)
    layers.forEach { layer ->
        val paint = Paint().apply {
            color = layer.color
            asFrameworkPaint().maskFilter =
                BlurMaskFilter(layer.blurRadius.toPx().coerceAtLeast(0.1f), BlurMaskFilter.Blur.NORMAL)
        }
        drawIntoCanvas { canvas ->
            canvas.save()
            canvas.translate(layer.offsetX.toPx(), layer.offsetY.toPx())
            canvas.drawOutline(outline, paint)
            canvas.restore()
        }
    }
}
fun Modifier.tcShadow(layer: TcShadowLayer, shape: Shape = RectangleShape) = tcShadow(listOf(layer), shape)

/** Tokens extraídos literalmente de nextjs-app/app/globals.css:78-89 (rgba(15,23,42,X) = Slate.copy(alpha=X)). */
object TcShadow {
    private val Slate = Color(0xFF0F172A)

    val Xs = listOf(TcShadowLayer(offsetY = 1.dp, blurRadius = 2.dp, color = Slate.copy(alpha = .04f)))
    val Sm = listOf(
        TcShadowLayer(offsetY = 1.dp, blurRadius = 3.dp, color = Slate.copy(alpha = .06f)),
        TcShadowLayer(offsetY = 1.dp, blurRadius = 2.dp, color = Slate.copy(alpha = .04f)),
    )
    val Md = listOf(
        TcShadowLayer(offsetY = 4.dp, blurRadius = 8.dp, color = Slate.copy(alpha = .06f)),
        TcShadowLayer(offsetY = 2.dp, blurRadius = 4.dp, color = Slate.copy(alpha = .04f)),
    )
    val Lg = listOf(
        TcShadowLayer(offsetY = 8.dp, blurRadius = 24.dp, color = Slate.copy(alpha = .08f)),
        TcShadowLayer(offsetY = 4.dp, blurRadius = 8.dp, color = Slate.copy(alpha = .04f)),
    )
    val Xl = listOf(
        TcShadowLayer(offsetY = 16.dp, blurRadius = 48.dp, color = Slate.copy(alpha = .10f)),
        TcShadowLayer(offsetY = 8.dp, blurRadius = 16.dp, color = Slate.copy(alpha = .06f)),
    )
    val Card = listOf(
        TcShadowLayer(offsetY = 1.dp, blurRadius = 4.dp, color = Slate.copy(alpha = .06f)),
        TcShadowLayer(offsetY = 4.dp, blurRadius = 16.dp, color = Slate.copy(alpha = .04f)),
    )
    val CardHover = listOf(
        TcShadowLayer(offsetY = 8.dp, blurRadius = 32.dp, color = Slate.copy(alpha = .12f)),
        TcShadowLayer(offsetY = 4.dp, blurRadius = 12.dp, color = Slate.copy(alpha = .06f)),
    )
    val Green = listOf(TcShadowLayer(offsetY = 4.dp, blurRadius = 16.dp, color = Color(0xFF16A34A).copy(alpha = .20f)))
    val GreenLg = listOf(TcShadowLayer(offsetY = 8.dp, blurRadius = 32.dp, color = Color(0xFF16A34A).copy(alpha = .28f)))
    val Amber = listOf(TcShadowLayer(offsetY = 4.dp, blurRadius = 14.dp, color = Color(0xFFF59E0B).copy(alpha = .25f)))

    // Sombras de componente específico (valores inline reais, não os 10 tokens genéricos acima)
    val CategoryBadge = listOf(TcShadowLayer(offsetY = 4.dp, blurRadius = 12.dp, color = Color.Black.copy(alpha = .15f))) // globals.css:1101
    val FeaturedBadge = listOf(TcShadowLayer(offsetY = 2.dp, blurRadius = 8.dp, color = Color(0xFFF59E0B).copy(alpha = .35f))) // globals.css:1093
    val FavButton = listOf(TcShadowLayer(offsetY = 2.dp, blurRadius = 8.dp, color = Color.Black.copy(alpha = .08f))) // globals.css:1117
    val HeaderScrolled = listOf(TcShadowLayer(offsetY = 1.dp, blurRadius = 12.dp, color = Slate.copy(alpha = .06f))) // globals.css:305
    val Whatsapp = listOf(TcShadowLayer(offsetY = 4.dp, blurRadius = 15.dp, color = Color(0xFF25D366).copy(alpha = .20f))) // globals.css:2729
    val WhatsappHover = listOf(TcShadowLayer(offsetY = 8.dp, blurRadius = 20.dp, color = Color(0xFF25D366).copy(alpha = .30f))) // globals.css:2733
}
