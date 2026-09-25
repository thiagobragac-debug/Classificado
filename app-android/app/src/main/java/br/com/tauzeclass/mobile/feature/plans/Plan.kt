package br.com.tauzeclass.mobile.feature.plans

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Colunas reais confirmadas ao vivo via curl no Postgrest (`plans?is_active=eq.true`). */
@Serializable
data class Plan(
    val id: String,
    val name: String,
    @SerialName("name_es") val nameEs: String? = null,
    val description: String? = null,
    @SerialName("description_es") val descriptionEs: String? = null,
    val price: Double,
    @SerialName("promotional_price") val promotionalPrice: Double? = null,
    @SerialName("price_usd") val priceUsd: Double? = null,
    @SerialName("promotional_price_usd") val promotionalPriceUsd: Double? = null,
    val currency: String = "BRL",
    val icon: String? = null,
    @SerialName("max_ads") val maxAds: Int = 0,
    @SerialName("max_photos") val maxPhotos: Int = 5,
    @SerialName("highlight_count") val highlightCount: Int = 0,
    @SerialName("has_video") val hasVideo: Boolean = false,
    @SerialName("has_banner") val hasBanner: Boolean = false,
    val features: List<String> = emptyList(),
    @SerialName("sort_order") val sortOrder: Int = 0,
) {
    val monthlyPrice: Double get() = promotionalPrice ?: price
    val isFree: Boolean get() = price <= 0.0
    fun annualPrice(): Double = monthlyPrice * 0.8 * 12 // mesma fórmula do site (20% off), CheckoutModal.tsx/route.ts

    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): priceUsd/promotionalPriceUsd
    // já eram buscados do backend mas nunca usados — a tela de Planos sempre
    // mostrava BRL, mesmo pra visitante fora do Brasil, diferente do site
    // (PricingClientUI.tsx, troca de moeda via geoip). Mesma regra: só usa
    // USD se o geoip indicar país != BR E o plano tiver price_usd cadastrado
    // (nem todo plano precisa ter preço internacional).
    private val hasUsdPrice: Boolean get() = priceUsd != null

    fun displayPrice(useUsd: Boolean): Double =
        if (useUsd && hasUsdPrice) (promotionalPriceUsd ?: priceUsd!!) else monthlyPrice

    fun displayAnnualPrice(useUsd: Boolean): Double = displayPrice(useUsd) * 0.8 * 12

    fun displayCurrency(useUsd: Boolean): String = if (useUsd && hasUsdPrice) "USD" else "BRL"
}

enum class BillingCycle(val apiValue: String) { MONTHLY("monthly"), ANNUAL("annual") }
