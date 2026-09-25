package br.com.tauzeclass.mobile.feature.auctions

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.FilterOperator
import io.github.jan.supabase.realtime.PostgresAction
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject
import javax.inject.Singleton

private const val AUCTION_EVENT_COLUMNS =
    "id, slug, title, date, status, youtube, cover, catalog, min_bid, step, accepts_bids, created_at"

private const val AUCTION_LOT_COLUMNS =
    "id, auction_id, lot_number, title, min_bid, image, video, sire, dam, description, current_bid, winner_id"

@Singleton
class AuctionsRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    /** Espelha fetchAuctions() de app/(public)/leiloes/page.tsx, sem paginação (dataset pequeno). */
    suspend fun getAuctionEvents(filters: AuctionFilters): List<AuctionEvent> =
        supabase.postgrest.from("auction_events").select(Columns.raw(AUCTION_EVENT_COLUMNS)) {
            filter {
                when (filters.status) {
                    AuctionStatusFilter.ATIVOS -> isIn("status", listOf("live", "scheduled", "active"))
                    AuctionStatusFilter.ENCERRADOS -> eq("status", "closed")
                    AuctionStatusFilter.CANCELADOS -> eq("status", "cancelled")
                    AuctionStatusFilter.TODOS -> {} // RLS já exclui 'draft' sozinho
                }
                if (filters.search.isNotBlank()) ilike("title", "%${filters.search.trim()}%")
            }
            order("date", Order.ASCENDING)
        }.decodeList()

    suspend fun getAuctionBySlug(slug: String): AuctionEvent? =
        supabase.postgrest.from("auction_events").select(Columns.raw(AUCTION_EVENT_COLUMNS)) {
            filter { eq("slug", slug) }
        }.decodeSingleOrNull()

    suspend fun getLots(auctionId: String): List<AuctionLot> =
        supabase.postgrest.from("auction_lots").select(Columns.raw(AUCTION_LOT_COLUMNS)) {
            filter { eq("auction_id", auctionId) }
            order("lot_number", Order.ASCENDING)
        }.decodeList()

    /**
     * place_lot_bid_atomic sempre retorna HTTP 200 com {success:false,error:"..."}
     * pra erro de negócio (nunca lança pro client nesse caso) — só erro de
     * transporte/RLS/rede lança PostgrestRestException, tratado no ViewModel.
     */
    suspend fun placeLotBid(lotId: String, amount: Double): PlaceBidResult =
        supabase.postgrest.rpc("place_lot_bid_atomic", buildJsonObject {
            put("p_lot_id", lotId)
            put("p_amount", amount)
        }).decodeAs()

    /**
     * Mesmo molde de MessagesRepository.observeMyMessageEvents: callbackFlow +
     * canal dedicado + postgresChangeFlow registrado antes do subscribe() +
     * awaitClose cancelando o job e desinscrevendo. Só UM listener (UPDATE em
     * auction_lots, filtro auction_id=eq.X) — é só isso que a publicação
     * supabase_realtime expõe pra essa tabela e é só isso que o site usa.
     */
    fun observeLotUpdates(auctionId: String, channelSuffix: String = "detail"): Flow<PostgresAction.Update> = callbackFlow {
        val realtimeChannel = supabase.channel("auction_lots_${auctionId}_$channelSuffix")

        val lotUpdates = realtimeChannel.postgresChangeFlow<PostgresAction.Update>(schema = "public") {
            table = "auction_lots"
            filter("auction_id", FilterOperator.EQ, auctionId)
        }

        val collectJob = launch { lotUpdates.collect { action -> trySend(action) } }

        realtimeChannel.subscribe() // suspend; connectOnSubscribe=true (default)

        awaitClose {
            collectJob.cancel()
            CoroutineScope(Dispatchers.IO).launch { runCatching { realtimeChannel.unsubscribe() } }
        }
    }
}
