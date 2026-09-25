package br.com.tauzeclass.mobile.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow

@Composable
fun RegisterScreen(
    onRegisterSuccess: () -> Unit,
    onNavigateToLogin: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(TcColors.Bg)
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(TcSpacing.sp6),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(Modifier.height(TcSpacing.sp6))
        AuthBrandHeader()
        Spacer(Modifier.height(TcSpacing.sp6))

        Column(
            modifier = Modifier.fillMaxWidth()
                .tcShadow(TcShadow.Card, TcShape.CategoryCard)
                .background(TcColors.Surface, TcShape.CategoryCard)
                .padding(TcSpacing.sp5)
        ) {
            AuthToggle(isLogin = false, onLoginClick = onNavigateToLogin, onRegisterClick = {})
            Spacer(Modifier.height(TcSpacing.sp5))

            // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): faltava campo de
            // nome — o cadastro por e-mail nunca enviava esse dado pro
            // backend, deixando o perfil sem nome (ver AuthRepository.kt).
            AuthTextField(
                value = uiState.name,
                onValueChange = viewModel::onNameChange,
                label = stringResource(R.string.auth_label_name),
                leadingIcon = Icons.Filled.Person,
            )
            Spacer(Modifier.height(TcSpacing.sp3))
            AuthTextField(
                value = uiState.email,
                onValueChange = viewModel::onEmailChange,
                label = stringResource(R.string.auth_email_label),
                placeholder = stringResource(R.string.auth_email_placeholder),
                leadingIcon = Icons.Filled.Email,
                keyboardType = KeyboardType.Email,
            )
            Spacer(Modifier.height(TcSpacing.sp3))
            AuthTextField(
                value = uiState.password,
                onValueChange = viewModel::onPasswordChange,
                label = stringResource(R.string.auth_password_label),
                leadingIcon = Icons.Filled.Lock,
                keyboardType = KeyboardType.Password,
                isPassword = true,
            )
            Text(
                stringResource(R.string.auth_password_hint_min),
                fontSize = 11.sp,
                color = TcColors.TextLight,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp)
            )
            Spacer(Modifier.height(TcSpacing.sp3))
            AuthTextField(
                value = uiState.confirmPassword,
                onValueChange = viewModel::onConfirmPasswordChange,
                label = stringResource(R.string.auth_confirm_password_label),
                leadingIcon = Icons.Filled.Lock,
                keyboardType = KeyboardType.Password,
                isPassword = true,
            )

            uiState.errorMessage?.let { message ->
                Spacer(Modifier.height(TcSpacing.sp4))
                AuthAlert(message, isError = true)
            }

            GradientButton(
                text = if (uiState.loadingAction == AuthLoadingAction.EMAIL) stringResource(R.string.auth_creating_account) else stringResource(R.string.auth_toggle_register),
                onClick = { viewModel.register(onRegisterSuccess) },
                loading = uiState.loadingAction == AuthLoadingAction.EMAIL,
                enabled = !uiState.loading,
                gradient = TcGradient.Primary,
                shadowLayers = TcShadow.Green,
                modifier = Modifier.fillMaxWidth().padding(top = TcSpacing.sp5)
            )
        }

        TextButton(
            onClick = onNavigateToLogin,
            modifier = Modifier.padding(top = TcSpacing.sp5)
        ) {
            Text(stringResource(R.string.auth_have_account_login), color = TcColors.Primary, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(TcSpacing.sp6))
    }
}
