package br.com.tauzeclass.mobile.feature.events

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.outlined.ImageNotSupported
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailScreen(onBackClick: () -> Unit, viewModel: EventDetailViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(stringResource(R.string.events_detail_title)) },
            navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
        )
    }) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            when (val state = uiState) {
                EventDetailUiState.Loading -> CircularProgressIndicator(Modifier.align(Alignment.Center), color = TcColors.Primary)
                EventDetailUiState.NotFound -> ErrorState(stringResource(R.string.events_not_found), viewModel::retry)
                is EventDetailUiState.Error -> ErrorState(state.message, viewModel::retry)
                is EventDetailUiState.Content -> EventDetailContent(state.event)
            }
        }
    }
}

@Composable
private fun EventDetailContent(event: EventoAgro) {
    val context = LocalContext.current
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = TcSpacing.sp6)) {
        item {
            Box(Modifier.fillMaxWidth().aspectRatio(16f / 9f).background(TcColors.BgAlt)) {
                if (event.image != null) {
                    SubcomposeAsyncImage(
                        model = ImageRequest.Builder(context).data(event.image).crossfade(300).build(),
                        contentDescription = event.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Icon(Icons.Outlined.ImageNotSupported, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.align(Alignment.Center).size(48.dp))
                }
            }

            Column(Modifier.padding(TcSpacing.sp4)) {
                Text(event.title, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.ExtraBold))
                Spacer(Modifier.height(TcSpacing.sp3))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = TcColors.Primary, modifier = Modifier.size(20.dp))
                    Spacer(Modifier.width(TcSpacing.sp2))
                    Text(event.date, style = MaterialTheme.typography.bodyLarge, color = TcColors.Text)
                }

                event.locationStr?.let { location ->
                    Spacer(Modifier.height(TcSpacing.sp2))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TcColors.Primary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(TcSpacing.sp2))
                        Text(location, style = MaterialTheme.typography.bodyLarge, color = TcColors.Text)
                    }
                }

                event.organizer?.let { organizer ->
                    Spacer(Modifier.height(TcSpacing.sp2))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Filled.Person, contentDescription = null, tint = TcColors.Primary, modifier = Modifier.size(20.dp))
                        Spacer(Modifier.width(TcSpacing.sp2))
                        Text(stringResource(R.string.events_organizer, organizer), style = MaterialTheme.typography.bodyLarge, color = TcColors.Text)
                    }
                }

                // Sem coluna "description" no banco (confirmado na pesquisa) — não inventar texto.
                event.link?.takeIf { it.startsWith("http://") || it.startsWith("https://") }?.let { safeLink ->
                    Spacer(Modifier.height(TcSpacing.sp6))
                    Button(
                        onClick = { runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safeLink))) } },
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary),
                        modifier = Modifier.fillMaxWidth().height(52.dp).tcShadow(TcShadow.Green, RoundedCornerShape(16.dp))
                    ) {
                        Icon(Icons.Filled.OpenInNew, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.events_official_site))
                    }
                }
            }
        }
    }
}
