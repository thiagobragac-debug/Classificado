package br.com.tauzeclass.mobile.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddCircle
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AssistChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.listagem.Category
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcCategory
import br.com.tauzeclass.mobile.ui.theme.TcDisplayFontFamily
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing

@Composable
fun HomeHeroSection(
    userDisplayName: String?,
    stats: PlatformStats?,
    categories: List<Category>,
    onSearchSubmit: (query: String, categoriaId: String?) -> Unit,
    onCategoriaClick: (String) -> Unit,
    onAnunciarClick: () -> Unit,
) {
    var query by remember { mutableStateOf("") }

    Column(Modifier.fillMaxWidth().background(TcColors.Bg).padding(top = TcSpacing.sp4)) {

        Row(
            Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier.size(36.dp).background(TcGradient.Primary, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Text("TC", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 14.sp, fontFamily = TcDisplayFontFamily)
            }
            Spacer(Modifier.width(TcSpacing.sp2))
            Text("Tauze Class", style = MaterialTheme.typography.titleMedium.copy(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.Bold))
        }

        Spacer(Modifier.height(TcSpacing.sp4))

        Column(Modifier.padding(horizontal = TcSpacing.sp4)) {
            Text(
                text = userDisplayName?.let { stringResource(R.string.home_greeting_named, it) } ?: stringResource(R.string.home_greeting_anonymous),
                style = MaterialTheme.typography.bodyMedium, color = TcColors.TextMuted
            )
            Spacer(Modifier.height(4.dp))
            val taglinePrefix = stringResource(R.string.home_tagline_prefix)
            val taglineHighlight = stringResource(R.string.home_tagline_highlight)
            Text(
                buildAnnotatedString {
                    append(taglinePrefix)
                    withStyle(SpanStyle(color = TcColors.Primary)) { append(taglineHighlight) }
                },
                style = MaterialTheme.typography.headlineSmall.copy(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.ExtraBold)
            )
        }

        Spacer(Modifier.height(TcSpacing.sp4))

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(stringResource(R.string.home_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = TcColors.TextLight) },
            singleLine = true,
            shape = TcShape.Input,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { onSearchSubmit(query, null) }),
            modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4)
        )

        Spacer(Modifier.height(TcSpacing.sp2))

        val popularTags = listOf(
            stringResource(R.string.home_tag_fat_cattle),
            stringResource(R.string.home_tag_tractor),
            stringResource(R.string.home_tag_land_lease),
            stringResource(R.string.home_tag_quarter_horse)
        )
        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2),
            contentPadding = PaddingValues(horizontal = TcSpacing.sp4)
        ) {
            items(popularTags) { tag ->
                AssistChip(onClick = { onSearchSubmit(tag, null) }, label = { Text(tag, fontSize = 12.sp) })
            }
        }

        Spacer(Modifier.height(TcSpacing.sp5))

        Row(
            Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4),
            horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3),
            verticalAlignment = Alignment.CenterVertically
        ) {
            GradientButton(
                text = stringResource(R.string.nav_post_ad),
                icon = Icons.Filled.AddCircle,
                gradient = TcGradient.Accent,
                shadowLayers = TcShadow.Amber,
                onClick = onAnunciarClick,
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = { onSearchSubmit("", null) }) { Text(stringResource(R.string.home_explore), color = TcColors.Primary, fontWeight = FontWeight.SemiBold) }
        }

        stats?.let { s ->
            Spacer(Modifier.height(TcSpacing.sp5))
            Row(Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4), horizontalArrangement = Arrangement.SpaceBetween) {
                MiniStat("${s.totalAds}+", stringResource(R.string.home_stat_ads))
                MiniStat("${s.totalSellers}+", stringResource(R.string.home_stat_sellers))
                MiniStat("${s.totalCountries}", stringResource(R.string.home_stat_countries))
                MiniStat("${s.totalCities}+", stringResource(R.string.home_stat_cities))
            }
        }

        Spacer(Modifier.height(TcSpacing.sp5))

        if (categories.isNotEmpty()) {
            Text(stringResource(R.string.home_categories_header), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted, modifier = Modifier.padding(horizontal = TcSpacing.sp4))
            Spacer(Modifier.height(TcSpacing.sp2))
            LazyRow(
                horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3),
                contentPadding = PaddingValues(horizontal = TcSpacing.sp4)
            ) {
                items(categories, key = { it.id }) { cat ->
                    val tc = TcCategory.fromCategoryId(cat.id)
                    Column(
                        modifier = Modifier.width(72.dp).clickable { onCategoriaClick(cat.id) },
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Box(Modifier.size(56.dp).background(tc.bg, TcShape.CategoryCard), contentAlignment = Alignment.Center) {
                            Text(cat.icon, fontSize = 24.sp)
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(cat.namePt, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TcColors.TextMuted, maxLines = 1)
                    }
                }
            }
        }

        HorizontalDivider(color = TcColors.BorderLight, thickness = 1.dp, modifier = Modifier.padding(top = TcSpacing.sp5))
    }
}

@Composable
private fun MiniStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleMedium.copy(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.ExtraBold))
        Text(label, fontSize = 11.sp, color = TcColors.TextMuted)
    }
}
