package br.com.tauzeclass.mobile.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.dp
import br.com.tauzeclass.mobile.R

/**
 * Tokens de design extraídos LITERALMENTE de nextjs-app/app/globals.css.
 * Não altere estes valores sem atualizar o site primeiro — precisam
 * permanecer em paridade entre web e app nativo.
 */
object TcColors {
    val Primary = Color(0xFF15803D)
    val PrimaryMid = Color(0xFF16A34A)
    val PrimaryLight = Color(0xFF22C55E)
    val PrimarySoft = Color(0xFF86EFAC)
    val PrimaryPale = Color(0xFFF0FDF4)
    val PrimaryExtra = Color(0xFFDCFCE7)

    val Accent = Color(0xFFF59E0B)
    val AccentDark = Color(0xFFD97706)
    val AccentPale = Color(0xFFFFFBEB)

    val Bg = Color(0xFFFFFFFF)
    val BgAlt = Color(0xFFF8FAFC)
    val Surface = Color(0xFFFFFFFF)
    val SurfaceAlt = Color(0xFFF1F5F9)

    val Text = Color(0xFF0F172A)
    val TextMuted = Color(0xFF64748B)
    val TextLight = Color(0xFF94A3B8)

    val Border = Color(0xFFE2E8F0)
    val BorderLight = Color(0xFFF1F5F9)

    val Success = Color(0xFF16A34A)
    val Warning = Color(0xFFD97706)
    val Error = Color(0xFFDC2626)
    val Info = Color(0xFF2563EB)
}

/**
 * Cor de fundo (bg) e cor de destaque (clr) por categoria do marketplace.
 *
 * BUG CORRIGIDO (achado ao vivo comparando com o JSON real da RPC
 * get_localized_featured_ads): os ids reais de categoria no banco são tipo
 * "cat-bovinos", "cat-aquicult" (não "Aquicultura"), e duas categorias
 * ("caprinos", "medicamentos") não têm o prefixo "cat-" nenhum — o antigo
 * `fromSlug` comparava contra `it.name` (o nome do enum em português) e por
 * isso NUNCA batia com um id real, sempre caindo em `Outros`. Usar
 * `fromCategoryId`, que mapeia pelos ids reais confirmados via curl direto
 * no REST do Supabase.
 */
enum class TcCategory(val bg: Color, val clr: Color) {
    Bovinos(bg = Color(0xFFFFFBEB), clr = Color(0xFFD97706)),
    Equinos(bg = Color(0xFFFEF3C7), clr = Color(0xFFB45309)),
    Suinos(bg = Color(0xFFFFF7ED), clr = Color(0xFFEA580C)),
    Ovinos(bg = Color(0xFFF0FDF4), clr = Color(0xFF16A34A)),
    Aves(bg = Color(0xFFEFF6FF), clr = Color(0xFF2563EB)),
    Insumos(bg = Color(0xFFF0FDF4), clr = Color(0xFF15803D)),
    Maquinas(bg = Color(0xFFEFF6FF), clr = Color(0xFF1D4ED8)),
    Imoveis(bg = Color(0xFFF5F3FF), clr = Color(0xFF7C3AED)),
    Genetica(bg = Color(0xFFFDF2F8), clr = Color(0xFFDB2777)),
    Aquicultura(bg = Color(0xFFECFEFF), clr = Color(0xFF0891B2)),
    Servicos(bg = Color(0xFFFFF7ED), clr = Color(0xFFC2410C)),
    Outros(bg = Color(0xFFF8FAFC), clr = Color(0xFF475569)),
    // Cor sólida (clr) é literal do banco (#16a34a pras duas); bg pastel é
    // aproximação (mesma família visual do verde de Ovinos/Insumos), já que
    // a tabela CAT_COLORS do site não cobre essas 2 categorias novas.
    Caprinos(bg = Color(0xFFECFDF5), clr = Color(0xFF16A34A)),
    Medicamentos(bg = Color(0xFFF0FDFA), clr = Color(0xFF16A34A));

    companion object {
        private val byId = mapOf(
            "cat-bovinos" to Bovinos, "cat-equinos" to Equinos, "cat-suinos" to Suinos,
            "caprinos" to Caprinos, "cat-ovinos" to Ovinos, "cat-aves" to Aves,
            "cat-aquicult" to Aquicultura, "cat-insumos" to Insumos,
            "medicamentos" to Medicamentos, "cat-genetica" to Genetica,
            "cat-imoveis" to Imoveis, "cat-maquinas" to Maquinas,
            "cat-servicos" to Servicos, "cat-outros" to Outros,
        )

        /** Único jeito correto de resolver: o id real do banco é tipo "cat-bovinos", não "bovinos". */
        fun fromCategoryId(categoryId: String): TcCategory = byId[categoryId] ?: Outros
    }
}

object TcSpacing {
    val sp1 = 4.dp
    val sp2 = 8.dp
    val sp3 = 12.dp
    val sp4 = 16.dp
    val sp5 = 20.dp
    val sp6 = 24.dp
    val sp7 = 32.dp
    val sp8 = 40.dp
    val sp9 = 48.dp
    val sp10 = 64.dp
    val sp11 = 80.dp
    val sp12 = 96.dp
}

object TcRadius {
    val r1 = 6.dp
    val r2 = 12.dp
    val r3 = 16.dp
    val r4 = 24.dp
    val r5 = 32.dp
    val full = 9999.dp
}

/** Gradientes reais do site (globals.css, ângulo 135deg ~ diagonal padrão do Brush.linearGradient). */
object TcGradient {
    val Primary = Brush.linearGradient(listOf(Color(0xFF16A34A), Color(0xFF15803D))) // logo, botão primário — globals.css:319,589
    val Accent = Brush.linearGradient(listOf(Color(0xFFF59E0B), Color(0xFFD97706))) // botão "Anunciar" — globals.css:550
    val AvatarFallback = Brush.linearGradient(listOf(Color(0xFF22C55E), Color(0xFF16A34A))) // avatar sem foto — SellerProfileHeader.module.css:30
}

/** Curvas/durações de transição — globals.css:91-94. */
object TcMotion {
    val FastEasing = CubicBezierEasing(0.4f, 0f, 0.2f, 1f)
    const val FastDurationMs = 150
    val SpringEasing = CubicBezierEasing(0.34f, 1.56f, 0.64f, 1f) // hover do cat-card no site
    const val SpringDurationMs = 350
}

/** Shapes semânticos — mesma escala numérica de TcRadius, nomeada pelo uso real observado no site. */
object TcShape {
    val Chip = RoundedCornerShape(TcRadius.r1) // 6dp — ad-tag (negociável, etc.)
    val CategoryIcon = RoundedCornerShape(TcRadius.r2) // 12dp — ícone/badge de categoria
    val CategoryCard = RoundedCornerShape(TcRadius.r3) // 16dp — card de categoria, seller-card, bloco de seção
    val AdCard = RoundedCornerShape(TcRadius.r4) // 24dp — card de anúncio
    val Pill = RoundedCornerShape(TcRadius.full) // botões, badges genéricos
    val Input = RoundedCornerShape(TcRadius.r2) // 12dp — ~0.8rem/12.8px confirmado em .form-input do site
}

// ---------------------------------------------------------------------------
// Tipografia — Sora (display) e Inter (body) via Google Fonts (downloadable).
// Requer app/src/main/res/values/font_certs.xml e a permissão de INTERNET
// (já declarada no AndroidManifest).
// ---------------------------------------------------------------------------
private val googleFontProvider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage = "com.google.android.gms",
    certificates = R.array.com_google_android_gms_fonts_certs
)

private val soraGoogleFont = GoogleFont("Sora")
private val interGoogleFont = GoogleFont("Inter")

val TcDisplayFontFamily = FontFamily(
    Font(googleFont = soraGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.Normal),
    Font(googleFont = soraGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.Medium),
    Font(googleFont = soraGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.SemiBold),
    Font(googleFont = soraGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.Bold),
    Font(googleFont = soraGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.ExtraBold),
)

val TcBodyFontFamily = FontFamily(
    Font(googleFont = interGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.Normal),
    Font(googleFont = interGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.Medium),
    Font(googleFont = interGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.SemiBold),
    Font(googleFont = interGoogleFont, fontProvider = googleFontProvider, weight = FontWeight.Bold),
)

val TcTypography = Typography(
    displayLarge = TextStyle(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.Bold, fontSize = 57.sp, lineHeight = 64.sp),
    displayMedium = TextStyle(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.Bold, fontSize = 45.sp, lineHeight = 52.sp),
    displaySmall = TextStyle(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.Bold, fontSize = 36.sp, lineHeight = 44.sp),
    headlineLarge = TextStyle(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 32.sp, lineHeight = 40.sp),
    headlineMedium = TextStyle(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 28.sp, lineHeight = 36.sp),
    headlineSmall = TextStyle(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 24.sp, lineHeight = 32.sp),
    titleLarge = TextStyle(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.SemiBold, fontSize = 22.sp, lineHeight = 28.sp),
    titleMedium = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 24.sp),
    titleSmall = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    bodyLarge = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Normal, fontSize = 16.sp, lineHeight = 24.sp),
    bodyMedium = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Normal, fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Normal, fontSize = 12.sp, lineHeight = 16.sp),
    labelLarge = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Medium, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
    labelSmall = TextStyle(fontFamily = TcBodyFontFamily, fontWeight = FontWeight.Medium, fontSize = 11.sp, lineHeight = 16.sp),
)

/**
 * Esquema de cores derivado 1:1 dos tokens do site. Só os slots do Material3
 * que têm um token real correspondente são sobrescritos; os demais
 * (errorContainer, inverseSurface, scrim etc.) ficam no padrão do Material3
 * para não inventar cores fora do design system informado.
 */
private val TcLightColorScheme = lightColorScheme(
    primary = TcColors.Primary,
    onPrimary = Color.White,
    primaryContainer = TcColors.PrimaryExtra,
    onPrimaryContainer = TcColors.Primary,
    secondary = TcColors.PrimaryMid,
    onSecondary = Color.White,
    secondaryContainer = TcColors.PrimaryPale,
    onSecondaryContainer = TcColors.Primary,
    tertiary = TcColors.Accent,
    onTertiary = Color.White,
    tertiaryContainer = TcColors.AccentPale,
    onTertiaryContainer = TcColors.AccentDark,
    background = TcColors.Bg,
    onBackground = TcColors.Text,
    surface = TcColors.Surface,
    onSurface = TcColors.Text,
    surfaceVariant = TcColors.SurfaceAlt,
    onSurfaceVariant = TcColors.TextMuted,
    outline = TcColors.Border,
    outlineVariant = TcColors.BorderLight,
    error = TcColors.Error,
    onError = Color.White,
)

/**
 * Tema único (claro) do Tauze Class Mobile. Os tokens fornecidos não incluem
 * uma paleta escura DISTINTA — por isso o app sempre usa TcLightColorScheme,
 * mesmo com o tema escuro do sistema ativado. Revisar quando/se o site
 * ganhar um dark mode próprio.
 */
@Composable
fun TauzeClassTheme(
    darkTheme: Boolean = isSystemInDarkTheme(), // reservado para uso futuro
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = TcLightColorScheme,
        typography = TcTypography,
        content = content
    )
}
