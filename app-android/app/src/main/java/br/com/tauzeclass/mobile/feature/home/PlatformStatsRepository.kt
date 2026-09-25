package br.com.tauzeclass.mobile.feature.home

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PlatformStatsRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    private suspend fun countActiveAds(categoryId: String? = null): Long =
        supabase.postgrest.from("ads").select(Columns.raw("id")) {
            head = true
            count(Count.EXACT)
            filter {
                eq("status", "active")
                categoryId?.let { eq("category_id", it) }
            }
        }.countOrNull() ?: 0L

    suspend fun getPlatformStats(): PlatformStats {
        val totalAds = countActiveAds()
        val totalBovinos = countActiveAds("cat-bovinos")
        val totalMachines = countActiveAds("cat-maquinas")
        val totalImoveis = countActiveAds("cat-imoveis")
        val totalSellers = supabase.postgrest.from("profiles").select(Columns.raw("id")) {
            head = true; count(Count.EXACT)
            filter { eq("verified", true) }
        }.countOrNull() ?: 0L
        val today = java.time.Instant.now().toString()
        val totalAuctions = supabase.postgrest.from("auction_events").select(Columns.raw("id")) {
            head = true; count(Count.EXACT)
            filter { neq("status", "draft"); gte("date", today) }
        }.countOrNull() ?: 0L

        return PlatformStats(totalAds, totalSellers, totalBovinos, totalMachines, totalAuctions, totalImoveis)
    }
}
