package br.com.tauzeclass.mobile.feature.listagem

import br.com.tauzeclass.mobile.feature.ads.Ad
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.exception.PostgrestRestException
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.query.filter.TextSearchType
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

// Superset de AD_CARD_COLUMNS (feature/ads/AdsRepository.kt) — mesmas colunas
// de card + subcategory_id, necessário só pro filtro de subcategoria (não
// exibido no card).
private const val AD_LISTAGEM_COLUMNS =
    "id, slug, title_pt, title_es, price, currency, price_unit_pt, negotiable, featured, images, category_id, subcategory_id, city, state, country, views_count, created_at, profiles(id, slug, name, avatar_url, verified)"

@Singleton
class ListagemRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    suspend fun getCategories(): List<Category> =
        supabase.postgrest.from("categories").select(Columns.raw("id,name_pt,name_es,icon,color,active,sort_order")) {
            filter { eq("active", true) }
            order("sort_order", Order.ASCENDING)
        }.decodeList()

    suspend fun getSubcategories(categoryId: String): List<Subcategory> =
        supabase.postgrest.from("subcategories").select(Columns.raw("id,category_id,name_pt,name_es,active,sort_order")) {
            filter { eq("category_id", categoryId); eq("active", true) }
            order("sort_order", Order.ASCENDING)
        }.decodeList()

    // --- Cascata geográfica: 3 SELECTs simples sobre `ads`, mesmo padrão de lib/useGeoCascading.ts ---
    suspend fun getCountries(categoriaId: String? = null): List<String> =
        supabase.postgrest.from("ads").select(Columns.raw("country")) {
            filter {
                eq("status", "active")
                categoriaId?.let { eq("category_id", it) }
            }
        }.decodeList<CountryRow>().mapNotNull { it.country?.trim()?.takeIf { c -> c.isNotEmpty() } }
            .distinctBy { it.lowercase() }.sorted()

    suspend fun getStates(pais: String, categoriaId: String? = null): List<String> =
        supabase.postgrest.from("ads").select(Columns.raw("state")) {
            filter {
                eq("country", pais); eq("status", "active")
                categoriaId?.let { eq("category_id", it) }
            }
        }.decodeList<StateRow>().mapNotNull { it.state?.trim()?.takeIf { s -> s.isNotEmpty() } }
            .map { BR_STATES[it.uppercase()] ?: it } // expande UF -> nome completo, igual expandUf() do site
            .distinctBy { it.lowercase() }.sorted()

    suspend fun getCities(pais: String, estado: String, categoriaId: String? = null): List<String> =
        supabase.postgrest.from("ads").select(Columns.raw("city")) {
            filter {
                eq("country", pais)
                isIn("state", ufEquivalents(estado))
                eq("status", "active")
                categoriaId?.let { eq("category_id", it) }
            }
        }.decodeList<CityRow>().mapNotNull { it.city?.trim()?.takeIf { c -> c.isNotEmpty() } }
            .distinctBy { it.lowercase() }.sorted()

    // --- Query principal (não é RPC — select() com filtros, espelha ads.service.ts:126-266) ---
    suspend fun getAdsListagem(filters: ListagemFilters, page: Int, pageSize: Int = 24): ListagemResult {
        val from = ((page - 1) * pageSize).toLong()
        val to = from + pageSize - 1

        try {
            val result = supabase.postgrest.from("ads").select(Columns.raw(AD_LISTAGEM_COLUMNS)) {
                count(Count.EXACT)
                filter {
                    eq("status", "active")
                    filters.vendedorId?.let { eq("user_id", it) }
                    filters.categoria?.let { eq("category_id", it) }
                    if (filters.subcategorias.isNotEmpty()) isIn("subcategory_id", filters.subcategorias.toList())
                    filters.finalidade?.let { eq("purpose", it) }
                    filters.pais?.takeIf { it != "todos" }?.let { ilike("country", it) }
                    filters.estado?.let { isIn("state", ufEquivalents(it)) }
                    filters.cidade?.let { ilike("city", it) }
                    filters.precoMin?.let { gte("price", it) }
                    filters.precoMax?.let { lte("price", it) }
                    if (filters.destaque) eq("featured", true)
                    if (filters.negociavel) eq("negotiable", true)
                    if (filters.busca.isNotBlank()) textSearch("fts", filters.busca.take(200), TextSearchType.WEBSEARCH, "portuguese")
                }
                when (filters.ordem) {
                    Ordem.PRICE_ASC -> order("price", Order.ASCENDING, nullsFirst = false)
                    Ordem.PRICE_DESC -> order("price", Order.DESCENDING, nullsFirst = false)
                    Ordem.FEATURED -> {
                        order("featured", Order.DESCENDING)
                        order("created_at", Order.DESCENDING)
                    }
                    Ordem.RECENT -> order("created_at", Order.DESCENDING)
                }
                range(from, to)
            }
            return ListagemResult(ads = result.decodeList<Ad>(), total = result.countOrNull() ?: 0L, page = page, pageSize = pageSize)
        } catch (e: PostgrestRestException) {
            if (e.code == "PGRST103") {
                // Página além do total real (Range Not Satisfiable) — refaz só com
                // page=1 pra extrair o total de verdade, devolve lista vazia honesta
                // em vez de conteúdo de outra página. ads.service.ts:216-245.
                if (page != 1) {
                    val real = getAdsListagem(filters, page = 1, pageSize = pageSize)
                    return ListagemResult(ads = emptyList(), total = real.total, page = page, pageSize = pageSize)
                }
                return ListagemResult(ads = emptyList(), total = 0L, page = page, pageSize = pageSize)
            }
            throw e
        }
    }

    /**
     * Escada de fallback geográfico cidade -> estado -> país -> tudo, mesma
     * lógica (sem a variante de raio/coordenadas, que depende de permissão de
     * localização ainda não implementada neste app) de
     * getAdsListagemComFallbackGeografico em ads.service.ts:280-353.
     */
    suspend fun getAdsListagemComFallback(filters: ListagemFilters, page: Int, pageSize: Int = 24): ListagemResult {
        val original = getAdsListagem(filters, page, pageSize)
        if (original.total > 0) return original

        // Só tenta ampliar automaticamente na primeira página — página>1 sem
        // resultado é simplesmente "acabaram as páginas", não motivo pra
        // trocar de localização.
        if (page != 1) return original

        if (filters.cidade != null) {
            val r = getAdsListagem(filters.copy(cidade = null), page = 1, pageSize)
            if (r.total > 0) return r.copy(fallbackApplied = FallbackGeografico.ParaEstado(filters.cidade, filters.estado))
        }
        if (filters.estado != null) {
            val r = getAdsListagem(filters.copy(cidade = null, estado = null), page = 1, pageSize)
            if (r.total > 0) return r.copy(fallbackApplied = FallbackGeografico.ParaPais(filters.estado, filters.pais))
        }
        if (filters.pais != null && filters.pais != "todos") {
            val r = getAdsListagem(filters.copy(cidade = null, estado = null, pais = null), page = 1, pageSize)
            if (r.total > 0) return r.copy(fallbackApplied = FallbackGeografico.ParaTudo(filters.pais))
        }
        return original // honestamente vazio — nenhum nível encontrou nada
    }
}

@Serializable private data class CountryRow(val country: String?)
@Serializable private data class StateRow(val state: String?)
@Serializable private data class CityRow(val city: String?)
