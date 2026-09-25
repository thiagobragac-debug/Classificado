package br.com.tauzeclass.mobile.feature.auth

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.ui.components.GoogleGlyph
import br.com.tauzeclass.mobile.ui.components.GradientButton
import br.com.tauzeclass.mobile.ui.theme.TcColors
import br.com.tauzeclass.mobile.ui.theme.TcGradient
import br.com.tauzeclass.mobile.ui.theme.TcShadow
import br.com.tauzeclass.mobile.ui.theme.TcShape
import br.com.tauzeclass.mobile.ui.theme.TcSpacing
import br.com.tauzeclass.mobile.ui.theme.tcShadow
import kotlinx.coroutines.launch

@Composable
fun LoginScreen(
    onLoginSuccess: () -> Unit,
    onNavigateToRegister: () -> Unit,
    viewModel: AuthViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

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
            AuthToggle(isLogin = true, onLoginClick = {}, onRegisterClick = onNavigateToRegister)
            Spacer(Modifier.height(TcSpacing.sp5))

            OutlinedButton(
                onClick = {
                    scope.launch {
                        when (val outcome = requestGoogleSignIn(context)) {
                            is GoogleSignInOutcome.Success ->
                                viewModel.signInWithGoogle(outcome.result, onLoginSuccess)
                            is GoogleSignInOutcome.NoAccountAvailable ->
                                viewModel.setGoogleSignInError(outcome.message)
                            GoogleSignInOutcome.Cancelled -> Unit
                            is GoogleSignInOutcome.Failure ->
                                viewModel.setGoogleSignInError(outcome.message)
                        }
                    }
                },
                enabled = !uiState.loading,
                border = BorderStroke(1.dp, TcColors.Border),
                shape = TcShape.Input,
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                if (uiState.loadingAction == AuthLoadingAction.GOOGLE) {
                    CircularProgressIndicator(strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.auth_connecting))
                } else {
                    GoogleGlyph()
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.auth_continue_google), fontWeight = FontWeight.SemiBold, color = Color(0xFF374151))
                }
            }

            AuthDivider(stringResource(R.string.auth_or_email))

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

            uiState.errorMessage?.let { message ->
                Spacer(Modifier.height(TcSpacing.sp4))
                AuthAlert(message, isError = true)
            }

            GradientButton(
                text = if (uiState.loadingAction == AuthLoadingAction.EMAIL) stringResource(R.string.auth_logging_in) else stringResource(R.string.auth_login_button),
                onClick = { viewModel.login(onLoginSuccess) },
                loading = uiState.loadingAction == AuthLoadingAction.EMAIL,
                enabled = !uiState.loading,
                gradient = TcGradient.Accent,
                shadowLayers = TcShadow.Amber,
                modifier = Modifier.fillMaxWidth().padding(top = TcSpacing.sp5)
            )
        }

        TextButton(
            onClick = onNavigateToRegister,
            modifier = Modifier.padding(top = TcSpacing.sp5)
        ) {
            Text(stringResource(R.string.auth_no_account_register), color = TcColors.Primary, fontWeight = FontWeight.SemiBold)
        }
        Spacer(Modifier.height(TcSpacing.sp6))
    }
}
