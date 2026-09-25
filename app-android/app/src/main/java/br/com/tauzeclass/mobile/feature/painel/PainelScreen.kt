package br.com.tauzeclass.mobile.feature.painel

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import br.com.tauzeclass.mobile.R
import br.com.tauzeclass.mobile.feature.messages.MessagesTab
import br.com.tauzeclass.mobile.feature.myads.MyAdsTab
import br.com.tauzeclass.mobile.feature.profile.ProfileTab
import br.com.tauzeclass.mobile.ui.theme.TcColors

enum class PainelTab { PERFIL, ANUNCIOS, MENSAGENS }

/** Rótulo exibido na aba — resolvido no local de composição (enum não pode chamar stringResource() no construtor). */
@Composable
private fun PainelTab.label(): String = when (this) {
    PainelTab.PERFIL -> stringResource(R.string.painel_tab_profile)
    PainelTab.ANUNCIOS -> stringResource(R.string.painel_tab_my_ads)
    PainelTab.MENSAGENS -> stringResource(R.string.painel_tab_messages)
}

/**
 * Abas sempre montadas, alterna visibilidade via `when` — mesmo espírito do
 * PainelClient.tsx do site (não desmonta ao trocar de aba). "Favoritos" já
 * existe como tela própria (bottom nav); "Assinatura" fica de fora deste
 * escopo.
 */
@Composable
fun PainelScreen(
    onEditAd: (String) -> Unit,
    onInstitucionalClick: () -> Unit,
    onVerificarIdentidadeClick: () -> Unit,
    onPlanosClick: () -> Unit,
    onOpenChat: (adId: String, otherId: String, otherName: String, adTitle: String) -> Unit
) {
    var selected by rememberSaveable { mutableStateOf(PainelTab.PERFIL) }

    Column(Modifier.fillMaxSize()) {
        TabRow(selectedTabIndex = selected.ordinal, containerColor = TcColors.Surface, contentColor = TcColors.Primary) {
            PainelTab.entries.forEach { tab ->
                Tab(selected = selected == tab, onClick = { selected = tab }, text = { Text(tab.label()) })
            }
        }
        when (selected) {
            PainelTab.PERFIL -> ProfileTab(onInstitucionalClick = onInstitucionalClick, onVerificarIdentidadeClick = onVerificarIdentidadeClick, onPlanosClick = onPlanosClick)
            PainelTab.ANUNCIOS -> MyAdsTab(onEditAd = onEditAd)
            PainelTab.MENSAGENS -> MessagesTab(onOpenChat = onOpenChat)
        }
    }
}
