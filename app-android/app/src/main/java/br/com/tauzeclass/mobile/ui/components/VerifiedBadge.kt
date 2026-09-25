package br.com.tauzeclass.mobile.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.ui.theme.TcShape

/** Selo "Verificado" — valores literais de SellerProfileHeader.module.css, único estilo canônico do site. */
@Composable
fun VerifiedBadge() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.background(Color(0xFFF0FDF4), TcShape.Pill)
            .border(1.dp, Color(0xFFBBF7D0), TcShape.Pill)
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Icon(Icons.Filled.Verified, contentDescription = null, tint = Color(0xFF15803D), modifier = Modifier.size(12.dp))
        Spacer(Modifier.width(3.dp))
        Text(stringResource(R.string.common_verified_badge), fontSize = 10.sp, fontWeight = FontWeight.Bold, color = Color(0xFF15803D))
    }
}
