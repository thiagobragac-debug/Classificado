package br.com.tauzeclass.mobile.feature.listagem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.SearchOff
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.ads.Ad
import br.com.tauzeclass.mobile.feature.ads.AdCard
import br.com.tauzeclass.mobile.feature.ads.AdCardSkeletonItem
import br.com.tauzeclass.mobile.ui.theme.TcCategory
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListagemScreen(
    onAdClick: (Ad) -> Unit = {},
    viewModel: ListagemViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val filters by viewModel.filters.collectAsState()
    val page by viewModel.page.collectAsState()
    val categories by viewModel.categories.collectAsState()
    var showFilters by remember { mutableStateOf(false) }
    var showSortMenu by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize()) {
        OutlinedTextField(
            value = filters.busca,
            onValueChange = viewModel::onBuscaChange,
            placeholder = { Text(stringResource(R.string.listagem_search_placeholder)) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            shape = TcShape.CategoryCard,
            modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp3)
        )

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2),
            contentPadding = PaddingValues(horizontal = TcSpacing.sp4)
        ) {
            item {
                CategoryChip(
                    label = stringResource(R.string.listagem_all_female), selected = filters.categoria == null, bg = TcColors.PrimaryPale, fg = TcColors.Primary,
                    onClick = { viewModel.onCategoriaChange(null) }
                )
            }
            items(categories, key = { it.id }) { cat ->
                val tc = TcCategory.fromCategoryId(cat.id)
                CategoryChip(
                    label = "${cat.icon} ${cat.namePt}", selected = filters.categoria == cat.id, bg = tc.bg, fg = tc.clr,
                    onClick = { viewModel.onCategoriaChange(if (filters.categoria == cat.id) null else cat.id) }
                )
            }
        }

        Spacer(Modifier.height(TcSpacing.sp2))

        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedButton(onClick = { showFilters = true }) {
                Icon(Icons.Outlined.Tune, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    if (filters.activeCount > 0) stringResource(R.string.listagem_filters_count, filters.activeCount)
                    else stringResource(R.string.listagem_filters)
                )
            }

            Box {
                OutlinedButton(onClick = { showSortMenu = true }) {
                    Text(ordemLabel(filters.ordem))
                }
                DropdownMenu(expanded = showSortMenu, onDismissRequest = { showSortMenu = false }) {
                    Ordem.entries.forEach { ordem ->
                        DropdownMenuItem(text = { Text(ordemLabel(ordem)) }, onClick = { viewModel.onOrdemChange(ordem); showSortMenu = false })
                    }
                }
            }
        }

        Spacer(Modifier.height(TcSpacing.sp2))

        when (val state = uiState) {
            ListagemUiState.Loading -> ResultsGrid(
                content = { items(6) { AdCardSkeletonItem() } }
            )
            is ListagemUiState.Error -> Box(Modifier.fillMaxSize().padding(TcSpacing.sp6), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(state.message, color = TcColors.TextMuted, textAlign = TextAlign.Center)
                    Spacer(Modifier.height(TcSpacing.sp4))
                    Button(onClick = viewModel::retry, colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary), shape = TcShape.Pill) {
                        Text(stringResource(R.string.common_retry))
                    }
                }
            }
            is ListagemUiState.Content -> {
                val result = state.result
                Column(Modifier.fillMaxSize()) {
                    result.fallbackApplied?.let { fallback ->
                        FallbackBanner(buildFallbackMessage(fallback))
                    }
                    if (result.total == 0L) {
                        Box(Modifier.fillMaxSize().padding(TcSpacing.sp8), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Outlined.SearchOff, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(48.dp))
                                Spacer(Modifier.height(TcSpacing.sp3))
                                Text(stringResource(R.string.listagem_empty), color = TcColors.TextMuted, textAlign = TextAlign.Center)
                                Spacer(Modifier.height(TcSpacing.sp4))
                                Button(onClick = viewModel::onLimparFiltros, colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary), shape = TcShape.Pill) {
                                    Text(stringResource(R.string.listagem_clear_filters))
                                }
                            }
                        }
                    } else {
                        ResultsGrid(content = {
                            items(result.ads, key = { it.id }) { ad ->
                                AdCard(
                                    ad = ad,
                                    onClick = { onAdClick(ad) },
                                    isFavorited = state.favoriteAdIds.contains(ad.id),
                                    onFavoriteClick = { viewModel.onFavoriteToggle(ad.id) }
                                )
                            }
                            item(span = { GridItemSpan(maxLineSpan) }) {
                                PaginationRow(
                                    page = page,
                                    totalPages = result.totalPages,
                                    total = result.total,
                                    onPrevious = { viewModel.onPageChange(page - 1) },
                                    onNext = { viewModel.onPageChange(page + 1) }
                                )
                            }
                        })
                    }
                }
            }
        }
    }

    if (showFilters) {
        FiltersBottomSheet(
            viewModel = viewModel,
            filters = filters,
            onDismiss = { showFilters = false }
        )
    }
}

@Composable
internal fun ResultsGrid(content: androidx.compose.foundation.lazy.grid.LazyGridScope.() -> Unit) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(2),
        contentPadding = PaddingValues(TcSpacing.sp4),
        horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp4),
        verticalArrangement = Arrangement.spacedBy(TcSpacing.sp4),
        modifier = Modifier.fillMaxSize(),
        content = content
    )
}

@Composable
private fun CategoryChip(label: String, selected: Boolean, bg: Color, fg: Color, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, fontSize = 13.sp, fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal) },
        colors = FilterChipDefaults.filterChipColors(
            containerColor = TcColors.Surface,
            selectedContainerColor = bg,
            labelColor = TcColors.TextMuted,
            selectedLabelColor = fg
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true, selected = selected,
            borderColor = TcColors.BorderLight, selectedBorderColor = bg
        )
    )
}

@Composable
private fun FallbackBanner(message: String) {
    Row(
        modifier = Modifier.fillMaxWidth()
            .padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)
            .background(TcColors.AccentPale, TcShape.CategoryIcon)
            .border(1.dp, TcColors.AccentDark.copy(alpha = 0.3f), TcShape.CategoryIcon)
            .padding(TcSpacing.sp3),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Outlined.Info, contentDescription = null, tint = TcColors.AccentDark, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(TcSpacing.sp2))
        Text(message, style = MaterialTheme.typography.bodySmall, color = TcColors.AccentDark, modifier = Modifier.weight(1f))
    }
}

@Composable
internal fun PaginationRow(page: Int, totalPages: Int, total: Long, onPrevious: () -> Unit, onNext: () -> Unit) {
    // Coluna (não uma única Row com os 3 elementos) — um Row divide a largura
    // sobrando entre os filhos na ordem em que aparecem, e "Página X de Y
    // (Z anúncios)" pode ser longo o bastante (paginação real tem até 3 dígitos
    // de página) pra espremer o botão "Próxima" numa coluna de 1 caractere de
    // largura, mesmo bug já visto no preço do AdCard.
    Column(
        modifier = Modifier.fillMaxWidth().padding(vertical = TcSpacing.sp4),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            stringResource(R.string.listagem_pagination_summary, page, totalPages, total),
            style = MaterialTheme.typography.bodySmall,
            color = TcColors.TextMuted,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(TcSpacing.sp3))
        Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
            OutlinedButton(onClick = onPrevious, enabled = page > 1) { Text(stringResource(R.string.common_previous)) }
            OutlinedButton(onClick = onNext, enabled = page < totalPages) { Text(stringResource(R.string.common_next)) }
        }
    }
}

@Composable
private fun ordemLabel(ordem: Ordem): String = when (ordem) {
    Ordem.RECENT -> stringResource(R.string.listagem_sort_recent)
    Ordem.PRICE_ASC -> stringResource(R.string.listagem_sort_price_asc)
    Ordem.PRICE_DESC -> stringResource(R.string.listagem_sort_price_desc)
    Ordem.FEATURED -> stringResource(R.string.listagem_sort_featured)
}

/** Mesmas mensagens de lib/geo-cascade.ts (buildGeoFallbackMessage), incluindo o caso especial de fromLabel==toLabel. */
@Composable
private fun buildFallbackMessage(fallback: FallbackGeografico): String {
    val from = fallback.fromLabel ?: return stringResource(R.string.listagem_fallback_showing_all)
    val to = fallback.toLabel
    return if (to == null || from == to) stringResource(R.string.listagem_fallback_all, from)
    else stringResource(R.string.listagem_fallback_widened, from, to)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FiltersBottomSheet(viewModel: ListagemViewModel, filters: ListagemFilters, onDismiss: () -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val subcategories by viewModel.subcategories.collectAsState()
    val countries by viewModel.countries.collectAsState()
    val states by viewModel.states.collectAsState()
    val cities by viewModel.cities.collectAsState()

    var precoMinText by remember(filters.precoMin) { mutableStateOf(filters.precoMin?.toInt()?.toString() ?: "") }
    var precoMaxText by remember(filters.precoMax) { mutableStateOf(filters.precoMax?.toInt()?.toString() ?: "") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier.fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = TcSpacing.sp4)
                .padding(bottom = TcSpacing.sp6)
        ) {
            Text(stringResource(R.string.listagem_filters), style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold))
            Spacer(Modifier.height(TcSpacing.sp4))

            if (filters.categoria != null && subcategories.isNotEmpty()) {
                Text(stringResource(R.string.listagem_subcategory), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
                Spacer(Modifier.height(TcSpacing.sp2))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2)) {
                    items(subcategories, key = { it.id }) { sub ->
                        val selected = filters.subcategorias.contains(sub.id)
                        FilterChip(
                            selected = selected,
                            onClick = {
                                viewModel.onSubcategoriasChange(
                                    if (selected) filters.subcategorias - sub.id else filters.subcategorias + sub.id
                                )
                            },
                            label = { Text(sub.namePt) }
                        )
                    }
                }
                Spacer(Modifier.height(TcSpacing.sp5))
            }

            PurposeOptions.byCategory[filters.categoria]?.let { options ->
                Text(stringResource(R.string.listagem_purpose), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
                Column {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.fillMaxWidth()
                            .selectable(selected = filters.finalidade == null, onClick = { viewModel.onFinalidadeChange(null) }, role = Role.RadioButton)
                    ) {
                        RadioButton(selected = filters.finalidade == null, onClick = null)
                        Text(stringResource(R.string.listagem_all_female))
                    }
                    options.forEach { option ->
                        val selected = filters.finalidade == option.value
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                                .selectable(selected = selected, onClick = { viewModel.onFinalidadeChange(option.value) }, role = Role.RadioButton)
                        ) {
                            RadioButton(selected = selected, onClick = null)
                            Text(stringResource(purposeLabelRes(option.value)))
                        }
                    }
                }
                Spacer(Modifier.height(TcSpacing.sp5))
            }

            Text(stringResource(R.string.listagem_location), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
            Spacer(Modifier.height(TcSpacing.sp2))
            GeoDropdown(
                label = stringResource(R.string.listagem_country), value = filters.pais, options = countries,
                onSelect = { viewModel.onLocalizacaoChange(pais = it, estado = null, cidade = null) }
            )
            Spacer(Modifier.height(TcSpacing.sp2))
            GeoDropdown(
                label = stringResource(R.string.listagem_state), value = filters.estado, options = states, enabled = filters.pais != null,
                onSelect = { viewModel.onLocalizacaoChange(pais = filters.pais, estado = it, cidade = null) }
            )
            Spacer(Modifier.height(TcSpacing.sp2))
            GeoDropdown(
                label = stringResource(R.string.listagem_city), value = filters.cidade, options = cities, enabled = filters.estado != null,
                onSelect = { viewModel.onLocalizacaoChange(pais = filters.pais, estado = filters.estado, cidade = it) }
            )
            Spacer(Modifier.height(TcSpacing.sp5))

            Text(stringResource(R.string.listagem_price_range), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
            Spacer(Modifier.height(TcSpacing.sp2))
            Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
                OutlinedTextField(
                    value = precoMinText,
                    onValueChange = { precoMinText = it.filter(Char::isDigit); viewModel.onPrecoChange(precoMinText.toDoubleOrNull(), precoMaxText.toDoubleOrNull()) },
                    label = { Text(stringResource(R.string.listagem_price_min)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                OutlinedTextField(
                    value = precoMaxText,
                    onValueChange = { precoMaxText = it.filter(Char::isDigit); viewModel.onPrecoChange(precoMinText.toDoubleOrNull(), precoMaxText.toDoubleOrNull()) },
                    label = { Text(stringResource(R.string.listagem_price_max)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
            }
            Spacer(Modifier.height(TcSpacing.sp5))

            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.listagem_only_featured))
                Switch(checked = filters.destaque, onCheckedChange = viewModel::onDestaqueToggle)
            }
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(stringResource(R.string.ads_negotiable))
                Switch(checked = filters.negociavel, onCheckedChange = viewModel::onNegociavelToggle)
            }
            Spacer(Modifier.height(TcSpacing.sp5))

            HorizontalDivider(color = TcColors.BorderLight)
            Spacer(Modifier.height(TcSpacing.sp4))
            Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
                TextButton(onClick = viewModel::onLimparFiltros, modifier = Modifier.weight(1f)) {
                    Text(stringResource(R.string.listagem_clear_filters))
                }
                Button(
                    onClick = onDismiss,
                    colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary),
                    shape = TcShape.Pill,
                    modifier = Modifier.weight(1f)
                ) { Text(stringResource(R.string.listagem_view_ads)) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun GeoDropdown(label: String, value: String?, options: List<String>, enabled: Boolean = true, onSelect: (String?) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded && enabled, onExpandedChange = { if (enabled) expanded = it }) {
        OutlinedTextField(
            value = value ?: stringResource(R.string.listagem_all_male),
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor()
        )
        ExposedDropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.listagem_all_male)) }, onClick = { onSelect(null); expanded = false })
            options.forEach { option ->
                DropdownMenuItem(text = { Text(option) }, onClick = { onSelect(option); expanded = false })
            }
        }
    }
}
