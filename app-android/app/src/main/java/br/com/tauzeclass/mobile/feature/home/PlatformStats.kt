package br.com.tauzeclass.mobile.feature.home

/**
 * Espelha getServerPlatformStats do site, mas sem o "piso" mínimo configurável
 * via admin (settings.tc_cnt_*) nem a flag de sufixo "+" — o app nativo só
 * tem a anon key, não o service role client que o site usa pra ler
 * `settings`. Simplificação deliberada, não suposição.
 */
data class PlatformStats(
    val totalAds: Long,
    val totalSellers: Long,
    val totalBovinos: Long,
    val totalMachines: Long,
    val totalAuctions: Long,
    val totalImoveis: Long,
    val totalCities: Int = 120, // fixo, mesmo valor hardcoded do site (supabase-server.ts)
    val totalCountries: Int = 4 // fixo, idem
)
