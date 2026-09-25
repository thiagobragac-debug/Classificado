package br.com.tauzeclass.mobile.feature.events

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
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.ImageNotSupported
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.common.ErrorState
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import coil3.compose.SubcomposeAsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventsListScreen(onBackClick: () -> Unit, onEventClick: (EventoAgro) -> Unit, viewModel: EventsListViewModel = hiltViewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }

    LaunchedEffect(query) {
        delay(400)
        viewModel.onSearchChange(query)
    }

    Scaffold(topBar = {
        TopAppBar(
            title = { Text(stringResource(R.string.events_list_title)) },
            navigationIcon = { IconButton(onClick = onBackClick) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.common_back)) } }
        )
    }) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            OutlinedTextField(
                value = query, onValueChange = { query = it },
                placeholder = { Text(stringResource(R.string.events_search_placeholder)) },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                singleLine = true, shape = TcShape.CategoryCard,
                modifier = Modifier.fillMaxWidth().padding(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp3)
            )

            when (val state = uiState) {
                EventsListUiState.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator(color = TcColors.Primary) }
                is EventsListUiState.Error -> ErrorState(state.message, viewModel::retry)
                is EventsListUiState.Content -> {
                    if (state.events.isEmpty()) {
                        Box(Modifier.fillMaxSize().padding(TcSpacing.sp8), Alignment.Center) {
                            Text(stringResource(R.string.events_empty), color = TcColors.TextMuted)
                        }
                    } else {
                        LazyColumn(contentPadding = PaddingValues(horizontal = TcSpacing.sp4, vertical = TcSpacing.sp2)) {
                            items(state.events, key = { it.id }) { event ->
                                EventCard(event, onClick = { onEventClick(event) })
                                Spacer(Modifier.height(TcSpacing.sp3))
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EventCard(event: EventoAgro, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Card(
        onClick = onClick, shape = TcShape.AdCard,
        colors = CardDefaults.cardColors(containerColor = TcColors.Surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        modifier = modifier.fillMaxWidth().tcShadow(TcShadow.Card, TcShape.AdCard)
    ) {
        Box {
            SubcomposeAsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(event.image).crossfade(300).build(),
                contentDescription = event.title, contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(16f / 9f),
                error = { Box(Modifier.fillMaxSize().background(TcColors.BgAlt), Alignment.Center) { Icon(Icons.Outlined.ImageNotSupported, contentDescription = null, tint = TcColors.TextLight) } }
            )
            if (event.featured) {
                Box(
                    modifier = Modifier.align(Alignment.TopStart).padding(TcSpacing.sp3)
                        .background(TcColors.Accent, TcShape.Pill).padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(stringResource(R.string.ads_badge_featured), color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
                }
            }
        }
        Column(Modifier.padding(TcSpacing.sp4)) {
            Text(event.title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(TcSpacing.sp2))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = TcColors.TextMuted, modifier = Modifier.size(14.dp))
                Spacer(Modifier.width(4.dp))
                Text(event.date, style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            event.locationStr?.let { location ->
                Spacer(Modifier.height(2.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Filled.LocationOn, contentDescription = null, tint = TcColors.TextMuted, modifier = Modifier.size(14.dp))
                    Spacer(Modifier.width(4.dp))
                    Text(location, style = MaterialTheme.typography.bodySmall, color = TcColors.TextMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
        }
    }
}
