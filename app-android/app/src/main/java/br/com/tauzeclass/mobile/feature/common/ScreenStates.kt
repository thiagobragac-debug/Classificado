package br.com.tauzeclass.mobile.feature.common

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.CloudOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow

/** Estado de erro compartilhado — reusado em Home, Anúncio, Favoritos e Listagem. */
@Composable
fun ErrorState(message: String, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(TcSpacing.sp6), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(Icons.Outlined.CloudOff, contentDescription = null, tint = TcColors.TextLight, modifier = Modifier.size(48.dp))
            Spacer(Modifier.height(TcSpacing.sp3))
            Text(message, color = TcColors.TextMuted, textAlign = TextAlign.Center)
            Spacer(Modifier.height(TcSpacing.sp4))
            Button(
                onClick = onRetry,
                shape = TcShape.Pill,
                colors = ButtonDefaults.buttonColors(containerColor = TcColors.Primary),
                modifier = Modifier.tcShadow(TcShadow.Green, TcShape.Pill)
            ) { Text(stringResource(R.string.common_retry)) }
        }
    }
}
