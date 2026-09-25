package br.com.tauzeclass.mobile.feature.anunciar

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.feature.listagem.BR_STATES
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch

private val STEP_TITLE_KEYS = listOf(R.string.anunciar_step1_title, R.string.anunciar_step2_title, R.string.anunciar_step3_title)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnunciarWizardScreen(onBackClick: () -> Unit, onDone: () -> Unit, viewModel: AnunciarViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    LaunchedEffect(viewModel) {
        viewModel.events.collect { msg -> scope.launch { snackbarHostState.showSnackbar(msg) } }
    }

    LaunchedEffect(uiState) {
        if ((uiState as? AnunciarUiState.Content)?.submitted == true) onDone()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if ((uiState as? AnunciarUiState.Content)?.isEditModeOfPublishedAd == true) stringResource(R.string.anunciar_title_edit) else stringResource(R.string.nav_post_ad)) },
                navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
            )
        }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val state = uiState) {
                AnunciarUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                is AnunciarUiState.Error -> ErrorState(state.message, viewModel::retry)
                is AnunciarUiState.Content -> Column(Modifier.fillMaxSize()) {
                    LinearProgressIndicator(
                        progress = { (state.step + 1) / 3f },
                        color = TcColors.Primary, trackColor = TcColors.BorderLight,
                        modifier = Modifier.fillMaxWidth()
                    )
                    Row(Modifier.fillMaxWidth().padding(TcSpacing.sp4), horizontalArrangement = Arrangement.SpaceBetween) {
                        val stepTitle = stringResource(STEP_TITLE_KEYS[state.step])
                        Text(stringResource(R.string.anunciar_step_progress, state.step + 1, stepTitle), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
                        SaveIndicatorLabel(state.saveIndicator)
                    }

                    Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = TcSpacing.sp4)) {
                        when (state.step) {
                            0 -> StepDataContent(state, viewModel)
                            1 -> StepLocationContent(state, viewModel)
                            else -> StepPhotosContent(state, viewModel)
                        }
                        Spacer(Modifier.height(TcSpacing.sp8))
                    }

                    Row(Modifier.fillMaxWidth().padding(TcSpacing.sp4), horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
                        if (state.step > 0) {
                            OutlinedButton(onClick = { viewModel.onStepChange(state.step - 1) }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.common_back)) }
                        }
                        if (state.step < 2) {
                            GradientButton(
                                text = stringResource(R.string.anunciar_next), onClick = { viewModel.onStepChange(state.step + 1) },
                                gradient = TcGradient.Primary, shadowLayers = TcShadow.Green, modifier = Modifier.weight(1f)
                            )
                        } else {
                            GradientButton(
                                text = if (state.isEditModeOfPublishedAd) stringResource(R.string.common_save_changes) else stringResource(R.string.anunciar_publish),
                                onClick = viewModel::onSubmit,
                                gradient = TcGradient.Accent, shadowLayers = TcShadow.Amber,
                                loading = state.submitting, modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
            SnackbarHost(hostState = snackbarHostState, modifier = Modifier.align(Alignment.BottomCenter))
        }
    }
}

@Composable
private fun SaveIndicatorLabel(indicator: SaveIndicator) {
    val text = when (indicator) {
        SaveIndicator.SAVING -> stringResource(R.string.anunciar_saving_draft)
        SaveIndicator.SAVED -> stringResource(R.string.anunciar_draft_saved)
        SaveIndicator.IDLE -> ""
    }
    if (text.isNotEmpty()) Text(text, style = MaterialTheme.typography.labelSmall, color = TcColors.TextLight)
}

// --- Step 1: Dados do Anúncio ---
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StepDataContent(state: AnunciarUiState.Content, viewModel: AnunciarViewModel) {
    val context = LocalContext.current
    val form = state.form
    val errors = state.step1Errors
    val selecionePlaceholder = stringResource(R.string.anunciar_select_placeholder)

    FormField(stringResource(R.string.anunciar_field_title), form.titulo, { viewModel.onFormChange(form.copy(titulo = it)) }, errors["titulo"])
    Spacer(Modifier.height(TcSpacing.sp2))

    DropdownField(
        label = stringResource(R.string.anunciar_field_category), value = state.categories.find { it.id == form.categoria }?.namePt ?: selecionePlaceholder,
        options = state.categories.map { it.id to it.namePt },
        onSelect = { viewModel.onCategoriaChange(it) }, error = errors["categoria"]
    )
    Spacer(Modifier.height(TcSpacing.sp2))

    if (state.subcategories.isNotEmpty()) {
        DropdownField(
            label = if (state.subcategoriaObrigatoria) stringResource(R.string.anunciar_field_subcategory_required) else stringResource(R.string.anunciar_field_subcategory),
            value = state.subcategories.find { it.id == form.subcategoria }?.namePt ?: selecionePlaceholder,
            options = state.subcategories.map { it.id to it.namePt },
            onSelect = { viewModel.onFormChange(form.copy(subcategoria = it)) }, error = errors["subcategoria"]
        )
        Spacer(Modifier.height(TcSpacing.sp2))
    }

    if (state.purposeOptions.isNotEmpty()) {
        Text(stringResource(R.string.listagem_purpose), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
        Column {
            state.purposeOptions.forEach { option ->
                val selected = form.finalidade == option.value
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth()
                        .selectable(selected = selected, onClick = { viewModel.onFormChange(form.copy(finalidade = option.value)) }, role = Role.RadioButton)
                ) {
                    RadioButton(selected = selected, onClick = null)
                    Text(option.labelPt)
                }
            }
        }
        Spacer(Modifier.height(TcSpacing.sp2))
    }

    OutlinedTextField(
        value = form.descricao, onValueChange = { viewModel.onFormChange(form.copy(descricao = it)) },
        label = { Text(stringResource(R.string.anunciar_field_description)) }, minLines = 4, shape = TcShape.Input,
        isError = errors["descricao"] != null,
        supportingText = errors["descricao"]?.let { { Text(it, color = TcColors.Error) } },
        modifier = Modifier.fillMaxWidth().padding(vertical = TcSpacing.sp1)
    )

    Spacer(Modifier.height(TcSpacing.sp2))
    Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp3)) {
        DropdownField(label = stringResource(R.string.anunciar_field_currency), value = form.moeda, options = MOEDAS.map { it to it }, onSelect = { viewModel.onFormChange(form.copy(moeda = it)) }, modifier = Modifier.width(110.dp))
        OutlinedTextField(
            value = form.preco,
            onValueChange = { viewModel.onFormChange(form.copy(preco = it.filter { c -> c.isDigit() || c == ',' })) },
            label = { Text(stringResource(R.string.anunciar_field_price)) }, prefix = { Text(form.moeda) },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            isError = errors["preco"] != null, shape = TcShape.Input,
            modifier = Modifier.weight(1f)
        )
    }
    errors["preco"]?.let { Text(it, style = MaterialTheme.typography.labelSmall, color = TcColors.Error) }

    Spacer(Modifier.height(TcSpacing.sp2))
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(stringResource(R.string.anunciar_accept_negotiate))
        Switch(checked = form.aNegociar, onCheckedChange = { viewModel.onFormChange(form.copy(aNegociar = it)) })
    }

    Spacer(Modifier.height(TcSpacing.sp2))
    val unidadesPreco = unidadesPreco(context)
    DropdownField(
        label = stringResource(R.string.anunciar_field_price_unit), value = unidadesPreco.find { it.first == form.unidadePreco.orEmpty() }?.second ?: stringResource(R.string.anunciar_unit_none),
        options = unidadesPreco, onSelect = { viewModel.onFormChange(form.copy(unidadePreco = it.ifBlank { null })) }
    )
    Spacer(Modifier.height(TcSpacing.sp2))
    val condicoes = condicoes(context)
    DropdownField(
        label = stringResource(R.string.anunciar_field_condition), value = condicoes.find { it.first == form.condicao.orEmpty() }?.second ?: stringResource(R.string.anunciar_condition_none),
        options = condicoes, onSelect = { viewModel.onFormChange(form.copy(condicao = it.ifBlank { null })) }
    )
}

// --- Step 2: Localização ---
@Composable
private fun StepLocationContent(state: AnunciarUiState.Content, viewModel: AnunciarViewModel) {
    val context = LocalContext.current
    val form = state.form
    val errors = state.step2Errors
    val paises = anunciarPaises(context)
    val selecionePlaceholder = stringResource(R.string.anunciar_select_placeholder)

    DropdownField(
        label = stringResource(R.string.listagem_country) + "*", value = paises.find { it.first == form.pais }?.second ?: form.pais, options = paises,
        onSelect = { viewModel.onPaisChange(it) }, error = errors["pais"]
    )
    Spacer(Modifier.height(TcSpacing.sp2))

    if (form.pais == "Brasil") { // valor de dado (schema do site), não texto de UI — não é chave de tradução
        // form.estado guarda o nome completo do estado (não a UF) — mesma convenção de
        // ListagemRepository/ads.state (ex.: "Rio Grande do Sul", não "RS").
        DropdownField(
            label = stringResource(R.string.listagem_state) + "*", value = form.estado ?: selecionePlaceholder,
            options = BR_STATES.values.map { it to it },
            onSelect = { nome -> viewModel.onFormChange(form.copy(estado = nome)) }, error = errors["estado"]
        )
    } else {
        // Argentina/Uruguai/Paraguai: listas de província/departamento não confirmadas na
        // pesquisa desta fase (StepLocation.tsx do site tem AR_PROVINCES/UY_DEPARTMENTS/
        // PY_DEPARTMENTS hardcoded) — campo livre até portar essas listas 1:1, TODO documentado.
        FormField(stringResource(R.string.anunciar_field_state_province), form.estado.orEmpty(), { viewModel.onFormChange(form.copy(estado = it)) }, errors["estado"])
    }
    Spacer(Modifier.height(TcSpacing.sp2))

    FormField(stringResource(R.string.listagem_city) + "*", form.cidade, { viewModel.onFormChange(form.copy(cidade = it)) }, errors["cidade"])
}

// --- Step 3: Fotos e Vídeo ---
@Composable
private fun StepPhotosContent(state: AnunciarUiState.Content, viewModel: AnunciarViewModel) {
    val context = LocalContext.current
    val form = state.form
    val remainingPhotos = (state.planLimits.maxPhotos - form.fotos.size).coerceAtLeast(1)

    val pickPhotos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(remainingPhotos)) { uris ->
        uris.forEach { viewModel.onPhotoPicked(context, it) }
    }
    val pickVideo = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { viewModel.onVideoPicked(context, it) }
    }

    Text(stringResource(R.string.anunciar_photos_count, form.fotos.size, state.planLimits.maxPhotos), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
    Spacer(Modifier.height(TcSpacing.sp2))
    val showAddPhotoTile = form.fotos.size < state.planLimits.maxPhotos
    val photoGridItemCount = form.fotos.size + if (showAddPhotoTile) 1 else 0
    val photoGridRows = ((photoGridItemCount + 2) / 3).coerceAtLeast(1) // divisão de teto — grid precisa de altura fixa dentro da Column já scrollável, senão crasha (scrollable dentro de scrollable sem altura limitada)
    LazyVerticalGrid(
        columns = GridCells.Fixed(3), horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2), verticalArrangement = Arrangement.spacedBy(TcSpacing.sp2),
        modifier = Modifier.fillMaxWidth().height((photoGridRows * 118).dp)
    ) {
        items(form.fotos, key = { it }) { url ->
            Box(Modifier.aspectRatio(1f).clip(TcShape.CategoryIcon)) {
                AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                IconButton(
                    onClick = { viewModel.onPhotoRemoved(url) },
                    modifier = Modifier.align(Alignment.TopEnd).size(28.dp).background(Color.Black.copy(alpha = 0.5f), CircleShape)
                ) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.common_remove), tint = Color.White, modifier = Modifier.size(16.dp)) }
            }
        }
        if (showAddPhotoTile) {
            item {
                Box(
                    Modifier.aspectRatio(1f).clip(TcShape.CategoryIcon).background(TcColors.BgAlt)
                        .border(1.dp, TcColors.Border, TcShape.CategoryIcon)
                        .clickable(enabled = !state.uploadingPhoto) { pickPhotos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                    contentAlignment = Alignment.Center
                ) {
                    if (state.uploadingPhoto) CircularProgressIndicator(modifier = Modifier.size(24.dp), color = TcColors.Primary)
                    else Icon(Icons.Filled.Add, contentDescription = stringResource(R.string.anunciar_add_photo), tint = TcColors.TextMuted)
                }
            }
        }
    }

    Spacer(Modifier.height(TcSpacing.sp6))
    Text(stringResource(R.string.anunciar_video_section), style = MaterialTheme.typography.labelLarge, color = TcColors.TextMuted)
    Spacer(Modifier.height(TcSpacing.sp2))
    if (!state.planLimits.hasVideo) {
        Text(stringResource(R.string.anunciar_video_locked), style = MaterialTheme.typography.bodySmall, color = TcColors.TextLight)
    } else if (form.video != null) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().background(TcColors.BgAlt, TcShape.CategoryIcon).padding(TcSpacing.sp3)) {
            Icon(Icons.Filled.Videocam, contentDescription = null, tint = TcColors.Primary)
            Spacer(Modifier.width(TcSpacing.sp2))
            Text(stringResource(R.string.anunciar_video_attached), modifier = Modifier.weight(1f))
            IconButton(onClick = viewModel::onVideoRemoved) { Icon(Icons.Filled.Close, contentDescription = stringResource(R.string.anunciar_remove_video)) }
        }
    } else {
        OutlinedButton(
            onClick = { pickVideo.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.VideoOnly)) },
            enabled = !state.uploadingVideo, modifier = Modifier.fillMaxWidth()
        ) {
            if (state.uploadingVideo) CircularProgressIndicator(modifier = Modifier.size(18.dp))
            else { Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(stringResource(R.string.anunciar_add_video)) }
        }
    }
}

@Composable
private fun FormField(label: String, value: String, onValueChange: (String) -> Unit, error: String?) {
    OutlinedTextField(
        value = value, onValueChange = onValueChange, label = { Text(label) }, singleLine = true, shape = TcShape.Input,
        isError = error != null, supportingText = error?.let { { Text(it, color = TcColors.Error) } },
        modifier = Modifier.fillMaxWidth().padding(vertical = TcSpacing.sp1)
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DropdownField(label: String, value: String, options: List<Pair<String, String>>, onSelect: (String) -> Unit, error: String? = null, modifier: Modifier = Modifier) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier.padding(vertical = TcSpacing.sp1)) {
        OutlinedTextField(
            value = value, onValueChange = {}, readOnly = true, label = { Text(label) }, shape = TcShape.Input,
            isError = error != null, supportingText = error?.let { { Text(it, color = TcColors.Error) } },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (optValue, optLabel) ->
                DropdownMenuItem(text = { Text(optLabel) }, onClick = { onSelect(optValue); expanded = false })
            }
        }
    }
}
