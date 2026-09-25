package br.com.tauzeclass.mobile.feature.auctions

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.Instant

/**
 * public.auction_events — colunas confirmadas via introspecção real do
 * PostgREST. ES ignorado no MVP (app 100% PT hoje) — só title/colunas base.
 */
@Serializable
data class AuctionEvent(
    val id: String,
    val slug: String,
    val title: String,
    val date: String, // timestamptz ISO-8601 -> Instant.parse()
    val status: String = "scheduled", // 'scheduled'|'live'|'closed'|'cancelled'|'active'|'draft' (draft nunca chega ao client — RLS exclui)
    val youtube: String? = null,
    val cover: String? = null,
    val catalog: String? = null,
    @SerialName("min_bid") val minBid: Double = 0.0,
    val step: Double = 0.0,
    @SerialName("accepts_bids") val acceptsBids: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null,
)

/**
 * public.auction_lots — SEM coluna de status, ordem de exibição ou horário
 * de fechamento (confirmado ao vivo via curl). Todos os lotes de um evento
 * `live` aceitam lance simultaneamente.
 */
@Serializable
data class AuctionLot(
    val id: String,
    @SerialName("auction_id") val auctionId: String,
    @SerialName("lot_number") val lotNumber: String,
    val title: String,
    @SerialName("min_bid") val minBid: Double = 0.0,
    val image: String? = null,
    val video: String? = null,
    val sire: String? = null,
    val dam: String? = null,
    val description: String? = null,
    @SerialName("current_bid") val currentBid: Double? = null,
    @SerialName("winner_id") val winnerId: String? = null,
) {
    val effectiveCurrentBid: Double get() = currentBid ?: minBid
    fun isWinning(userId: String?): Boolean = userId != null && winnerId == userId
    /** Mesmo cálculo do RPC (v_min_valid): coalesce(current_bid,min_bid,0) + greatest(step,0.01). */
    fun minValidBid(step: Double): Double = effectiveCurrentBid + maxOf(step, 0.01)
}

/** Payload jsonb de place_lot_bid_atomic. */
@Serializable
data class PlaceBidResult(
    val success: Boolean,
    val error: String? = null,
    @SerialName("bid_id") val bidId: String? = null,
    val amount: Double? = null,
    @SerialName("min_valid") val minValid: Double? = null,
)

enum class AuctionEventState { LIVE, SCHEDULED, CLOSED, CANCELLED }

/** Mesma lógica de getEventState() em AuctionsBrowser.tsx (fallback por data quando status é 'active'/'draft'/desconhecido). */
fun AuctionEvent.resolveState(): AuctionEventState = when (status) {
    "cancelled" -> AuctionEventState.CANCELLED
    "closed" -> AuctionEventState.CLOSED
    "live" -> AuctionEventState.LIVE
    "scheduled" -> AuctionEventState.SCHEDULED
    else -> {
        val eventDate = runCatching { Instant.parse(date) }.getOrNull()
        if (eventDate != null && eventDate.isAfter(Instant.now())) AuctionEventState.SCHEDULED else AuctionEventState.LIVE
    }
}

enum class AuctionStatusFilter { ATIVOS, TODOS, ENCERRADOS, CANCELADOS }

data class AuctionFilters(
    val status: AuctionStatusFilter = AuctionStatusFilter.ATIVOS,
    val search: String = "",
)

/** Portado 1:1 de getBidIncrements() em LotBiddingModal.tsx. Retorna DELTAS (somar ao lance atual, não o valor final). */
fun bidIncrements(currentBid: Double, step: Double): List<Double> {
    if (step > 0) return listOf(step, step * 2, step * 5, step * 10)
    return when {
        currentBid < 1_000.0 -> listOf(100.0, 200.0, 500.0, 1_000.0)
        currentBid < 10_000.0 -> listOf(500.0, 1_000.0, 2_000.0, 5_000.0)
        currentBid < 50_000.0 -> listOf(1_000.0, 2_500.0, 5_000.0, 10_000.0)
        else -> listOf(5_000.0, 10_000.0, 25_000.0, 50_000.0)
    }
}

/** Parser "1.234,56" -> 1234.56 — equivalente Kotlin ao NumericFormat (thousandSeparator=".", decimalSeparator=",") do site. */
fun parseBrlAmount(text: String): Double? =
    text.trim().replace(".", "").replace(",", ".").toDoubleOrNull()
