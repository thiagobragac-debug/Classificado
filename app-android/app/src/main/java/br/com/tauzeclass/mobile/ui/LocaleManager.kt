package br.com.tauzeclass.mobile.ui

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

/**
 * Idioma por app (PT/ES), sem precisar herdar de AppCompatActivity — só o
 * <service> AppLocalesMetadataHolderService no manifest (guarda a escolha
 * entre reinícios) + esta chamada, que recria as Activities automaticamente
 * pra aplicar o novo locale. `stringResource()` do Compose já lê o locale
 * atual sozinho, sem nenhuma outra mudança necessária nas telas.
 */
object LocaleManager {
    const val PORTUGUESE = "pt"
    const val SPANISH = "es"

    fun setLanguage(languageTag: String) {
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(languageTag))
    }

    /** Vazio = segue o idioma do sistema (nunca definido explicitamente pelo usuário ainda). */
    fun currentLanguageTag(): String? =
        AppCompatDelegate.getApplicationLocales().takeIf { !it.isEmpty }?.get(0)?.language
}
