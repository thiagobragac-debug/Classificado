package br.com.tauzeclass.mobile.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Aproximação geométrica do "G" do Google com as 4 cores oficiais de marca
 * (#4285F4/#34A853/#FBBC05/#EA4335, confirmadas em LoginForm.tsx do site) —
 * NÃO é o SVG oficial pixel-perfect (path data não foi confirmado por
 * nenhuma pesquisa). Trocar por um vector drawable oficial se precisão de
 * marca for exigida.
 */
@Composable
fun GoogleGlyph(size: Dp = 20.dp) {
    Canvas(Modifier.size(size)) {
        val r = this.size.minDimension / 2
        val stroke = r * 0.55f
        drawArc(Color(0xFF4285F4), startAngle = -45f, sweepAngle = 90f, useCenter = false, style = Stroke(stroke))
        drawArc(Color(0xFF34A853), startAngle = 45f, sweepAngle = 90f, useCenter = false, style = Stroke(stroke))
        drawArc(Color(0xFFFBBC05), startAngle = 135f, sweepAngle = 90f, useCenter = false, style = Stroke(stroke))
        drawArc(Color(0xFFEA4335), startAngle = 225f, sweepAngle = 90f, useCenter = false, style = Stroke(stroke))
    }
}
