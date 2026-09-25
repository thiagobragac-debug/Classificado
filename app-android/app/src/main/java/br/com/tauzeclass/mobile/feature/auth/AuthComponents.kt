package br.com.tauzeclass.mobile.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcDisplayFontFamily
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadowLayer
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow

/** Campo de texto de autenticação — valores literais confirmados em globals.css (.form-input/.form-label do site). */
@Composable
fun AuthTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier,
    placeholder: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    isPassword: Boolean = false,
) {
    var focused by remember { mutableStateOf(false) }
    var passwordVisible by remember { mutableStateOf(false) }

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label.uppercase(), fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.05.em) },
        placeholder = placeholder?.let { { Text(it, color = Color(0xFF94A3B8)) } },
        leadingIcon = { Icon(leadingIcon, contentDescription = null, tint = Color(0xFF9CA3AF)) },
        trailingIcon = if (isPassword) {
            {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    Icon(
                        if (passwordVisible) Icons.Filled.VisibilityOff else Icons.Filled.Visibility,
                        contentDescription = if (passwordVisible) stringResource(R.string.auth_hide_password) else stringResource(R.string.auth_show_password),
                        tint = Color(0xFF9CA3AF)
                    )
                }
            }
        } else null,
        visualTransformation = if (isPassword && !passwordVisible) PasswordVisualTransformation() else VisualTransformation.None,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        singleLine = true,
        shape = TcShape.Input,
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = TcColors.Primary,
            unfocusedBorderColor = Color(0xFFCBD5E1),
        ),
        modifier = modifier.fillMaxWidth()
            .onFocusChanged { focused = it.isFocused }
            .let {
                if (focused) it.tcShadow(TcShadowLayer(offsetY = 0.dp, blurRadius = 8.dp, color = TcColors.Primary.copy(alpha = .15f)), TcShape.Input) else it
            }
    )
}

/** Banner de erro/sucesso — cores exatas do site (#DC2626/#16A34A, fundo #FEF2F2/PrimaryPale). */
@Composable
fun AuthAlert(message: String, isError: Boolean = true) {
    val bg = if (isError) Color(0xFFFEF2F2) else TcColors.PrimaryPale
    val border = if (isError) Color(0xFFFECACA) else Color(0xFFBBF7D0)
    val fg = if (isError) TcColors.Error else TcColors.Success
    Row(
        Modifier.fillMaxWidth()
            .background(bg, RoundedCornerShape(8.dp))
            .border(1.dp, border, RoundedCornerShape(8.dp))
            .padding(TcSpacing.sp3),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(if (isError) Icons.Filled.ErrorOutline else Icons.Filled.CheckCircle, contentDescription = null, tint = fg, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(TcSpacing.sp2))
        Text(message, color = fg, style = MaterialTheme.typography.bodySmall)
    }
}

/** Aproximação literal de 0 1px 3px rgba(0,0,0,.1) — só pra pílula ativa do toggle. */
private val ToggleActiveShadow = listOf(TcShadowLayer(offsetY = 1.dp, blurRadius = 3.dp, color = Color.Black.copy(alpha = 0.1f)))

/** Segmented control Entrar/Criar Conta — valores literais do site (.auth-toggle/.toggle-btn). */
@Composable
fun AuthToggle(isLogin: Boolean, onLoginClick: () -> Unit, onRegisterClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .background(Color(0xFFF3F4F6), TcShape.Input)
            .padding(4.dp)
    ) {
        AuthToggleTab(stringResource(R.string.auth_toggle_login), isLogin, onLoginClick, Modifier.weight(1f))
        AuthToggleTab(stringResource(R.string.auth_toggle_register), !isLogin, onRegisterClick, Modifier.weight(1f))
    }
}

@Composable
private fun AuthToggleTab(label: String, active: Boolean, onClick: () -> Unit, modifier: Modifier) {
    Box(
        modifier
            .let { if (active) it.tcShadow(ToggleActiveShadow, TcShape.Input) else it }
            .clip(TcShape.Input)
            .background(if (active) TcColors.Surface else Color.Transparent)
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(label, fontWeight = FontWeight.SemiBold, color = if (active) TcColors.Primary else TcColors.TextMuted)
    }
}

/** Divisor "ou continue com e-mail" — valores literais do site (.divider). */
@Composable
fun AuthDivider(text: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = TcSpacing.sp3), verticalAlignment = Alignment.CenterVertically) {
        HorizontalDivider(Modifier.weight(1f), color = Color(0xFFE5E7EB))
        Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color(0xFF9CA3AF), modifier = Modifier.padding(horizontal = 16.dp))
        HorizontalDivider(Modifier.weight(1f), color = Color(0xFFE5E7EB))
    }
}

/** Cabeçalho de marca compacto — logo + wordmark + badges de confiança (conteúdo real de LoginBanner.tsx, adaptado pra fundo claro). */
@Composable
fun AuthBrandHeader() {
    Box(
        Modifier.size(56.dp).background(TcGradient.Primary, CircleShape),
        contentAlignment = Alignment.Center
    ) {
        Text("TC", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, fontFamily = TcDisplayFontFamily)
    }
    Spacer(Modifier.height(TcSpacing.sp3))
    Text(
        "Tauze Class",
        style = MaterialTheme.typography.headlineSmall.copy(fontFamily = TcDisplayFontFamily, fontWeight = FontWeight.ExtraBold)
    )
    Spacer(Modifier.height(TcSpacing.sp3))
    Row(horizontalArrangement = Arrangement.spacedBy(TcSpacing.sp2)) {
        AuthTrustBadge(stringResource(R.string.auth_badge_free))
        AuthTrustBadge(stringResource(R.string.auth_badge_mercosul))
    }
}

@Composable
private fun AuthTrustBadge(text: String) {
    Box(Modifier.background(TcColors.PrimaryPale, TcShape.Pill).padding(horizontal = 10.dp, vertical = 6.dp)) {
        Text(text, fontSize = 11.sp, fontWeight = FontWeight.SemiBold, color = TcColors.Primary)
    }
}
