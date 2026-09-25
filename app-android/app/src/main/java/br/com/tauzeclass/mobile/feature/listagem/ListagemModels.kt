package br.com.tauzeclass.mobile.feature.listagem

import br.com.tauzeclass.mobile.R
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Category(
    val id: String,
    @SerialName("name_pt") val namePt: String,
    @SerialName("name_es") val nameEs: String? = null,
    val icon: String,
    val color: String,
    val active: Boolean = true,
    @SerialName("sort_order") val sortOrder: Int = 0
)

@Serializable
data class Subcategory(
    val id: String,
    @SerialName("category_id") val categoryId: String,
    @SerialName("name_pt") val namePt: String,
    @SerialName("name_es") val nameEs: String? = null,
    val active: Boolean = true,
    @SerialName("sort_order") val sortOrder: Int = 0
)

enum class Ordem { RECENT, PRICE_ASC, PRICE_DESC, FEATURED }

data class ListagemFilters(
    val categoria: String? = null,
    val subcategorias: Set<String> = emptySet(),
    val finalidade: String? = null,
    val pais: String? = null, // null ou "todos" = sem filtro de país
    val estado: String? = null,
    val cidade: String? = null,
    val precoMin: Double? = null,
    val precoMax: Double? = null,
    val destaque: Boolean = false,
    val negociavel: Boolean = false,
    val busca: String = "",
    val ordem: Ordem = Ordem.RECENT,
    val vendedorId: String? = null // não entra em activeCount — não é filtro visível ao usuário na Listagem, usado só na tela de Vendedor
) {
    val activeCount: Int
        get() = listOfNotNull(
            subcategorias.takeIf { it.isNotEmpty() },
            finalidade,
            estado,
            cidade,
            precoMin,
            precoMax,
            destaque.takeIf { it },
            negociavel.takeIf { it }
        ).size
}

/** Nível em que o resultado foi efetivamente encontrado, quando a busca original não tinha resultado — mesmo enum de lib/geo-cascade.ts (GeoFallbackLevel), sem a variante de raio (app ainda não usa geolocalização). */
sealed class FallbackGeografico(val fromLabel: String?, val toLabel: String?) {
    class ParaEstado(from: String?, to: String?) : FallbackGeografico(from, to)
    class ParaPais(from: String?, to: String?) : FallbackGeografico(from, to)
    class ParaTudo(from: String?) : FallbackGeografico(from, null)
}

data class ListagemResult(
    val ads: List<br.com.tauzeclass.mobile.feature.ads.Ad>,
    val total: Long,
    val page: Int,
    val pageSize: Int = 24,
    val fallbackApplied: FallbackGeografico? = null
) {
    val totalPages: Int get() = if (total == 0L) 1 else ((total + pageSize - 1) / pageSize).toInt()
}

/**
 * Rótulos de "Finalidade" por categoria — portado 1:1 de
 * nextjs-app/lib/purposeOptions.ts (PURPOSE_OPTIONS_BY_CATEGORY). Só as
 * categorias listadas lá têm esse filtro; as demais não mostram a seção.
 */
data class PurposeOption(val value: String, val labelPt: String)

object PurposeOptions {
    val byCategory: Map<String, List<PurposeOption>> = mapOf(
        "cat-bovinos" to listOf(
            PurposeOption("corte", "Corte"),
            PurposeOption("leite", "Leite"),
            PurposeOption("dupla_aptidao", "Dupla Aptidão"),
            PurposeOption("reproducao", "Reprodução"),
        ),
        "cat-equinos" to listOf(
            PurposeOption("esporte", "Esporte"),
            PurposeOption("trabalho", "Trabalho"),
            PurposeOption("lazer", "Lazer"),
            PurposeOption("reproducao", "Reprodução"),
        ),
        "cat-suinos" to listOf(
            PurposeOption("reproducao", "Reprodução"),
            PurposeOption("terminacao", "Terminação"),
            PurposeOption("leitao", "Leitão"),
        ),
        "caprinos" to listOf(
            PurposeOption("leite", "Leite"),
            PurposeOption("corte", "Corte"),
            PurposeOption("reproducao", "Reprodução"),
        ),
        "cat-ovinos" to listOf(
            PurposeOption("la", "Lã"),
            PurposeOption("corte", "Corte"),
            PurposeOption("reproducao", "Reprodução"),
        ),
        "cat-imoveis" to listOf(
            PurposeOption("venda", "Venda"),
            PurposeOption("arrendamento", "Arrendamento"),
        ),
    )
}

/**
 * `PurposeOption.value` já é um identificador estável (é usado como valor de
 * filtro) — esse mapeamento resolve pro recurso de string traduzido, pra ser
 * chamado com stringResource() no(s) call site(s) que efetivamente renderizam
 * o rótulo (ListagemScreen.kt e AnunciarWizardScreen.kt), em vez de expor
 * texto em PT fixo aqui no modelo. `labelPt` continua existindo pra não
 * quebrar call sites que ainda não migraram.
 */
fun purposeLabelRes(value: String): Int = when (value) {
    "corte" -> R.string.purpose_corte
    "leite" -> R.string.purpose_leite
    "dupla_aptidao" -> R.string.purpose_dupla_aptidao
    "reproducao" -> R.string.purpose_reproducao
    "esporte" -> R.string.purpose_esporte
    "trabalho" -> R.string.purpose_trabalho
    "lazer" -> R.string.purpose_lazer
    "terminacao" -> R.string.purpose_terminacao
    "leitao" -> R.string.purpose_leitao
    "la" -> R.string.purpose_la
    "venda" -> R.string.purpose_venda
    "arrendamento" -> R.string.purpose_arrendamento
    else -> error("PurposeOption.value desconhecido: $value")
}

/** UF (sigla) -> nome completo — portado 1:1 de lib/useGeoCascading.ts (BR_STATES). */
val BR_STATES: Map<String, String> = mapOf(
    "AC" to "Acre", "AL" to "Alagoas", "AP" to "Amapá", "AM" to "Amazonas",
    "BA" to "Bahia", "CE" to "Ceará", "DF" to "Distrito Federal", "ES" to "Espírito Santo",
    "GO" to "Goiás", "MA" to "Maranhão", "MT" to "Mato Grosso", "MS" to "Mato Grosso do Sul",
    "MG" to "Minas Gerais", "PA" to "Pará", "PB" to "Paraíba", "PR" to "Paraná",
    "PE" to "Pernambuco", "PI" to "Piauí", "RJ" to "Rio de Janeiro", "RN" to "Rio Grande do Norte",
    "RS" to "Rio Grande do Sul", "RO" to "Rondônia", "RR" to "Roraima", "SC" to "Santa Catarina",
    "SP" to "São Paulo", "SE" to "Sergipe", "TO" to "Tocantins"
)
private val BR_STATES_REVERSE: Map<String, String> = BR_STATES.entries.associate { (uf, nome) -> nome to uf }

/** Nome completo -> [nome completo, sigla] (ou só [nome] se não for uma UF conhecida) — usado em .isIn("state", ...). */
fun ufEquivalents(estado: String): List<String> {
    val uf = BR_STATES_REVERSE[estado]
    return if (uf != null) listOf(estado, uf) else listOf(estado)
}
