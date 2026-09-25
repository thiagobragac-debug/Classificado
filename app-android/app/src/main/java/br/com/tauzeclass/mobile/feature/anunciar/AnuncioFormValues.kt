package br.com.tauzeclass.mobile.feature.anunciar

import android.content.Context
import br.com.tauzeclass.mobile.R

data class AnuncioFormValues(
    val titulo: String = "",
    val categoria: String? = null,
    val subcategoria: String? = null,
    val finalidade: String? = null,
    val descricao: String = "",
    val moeda: String = "BRL",
    val preco: String = "", // string formatada com vírgula decimal — convertida só no payload final
    val aNegociar: Boolean = false,
    val unidadePreco: String? = null,
    val condicao: String? = null,
    val pais: String = "Brasil",
    val estado: String? = null,
    val cidade: String = "",
    val fotos: List<String> = emptyList(), // URLs já no Storage — upload é imediato, não é File
    val video: String? = null,
)

/**
 * 4 países do wizard de Anunciar — schema real do site (StepLocation.tsx), diferente dos 5 do form de Perfil.
 * Primeiro elemento do par = valor persistido (mesmo literal do schema do site, nunca traduzido —
 * form.pais/country compara e grava esse valor); segundo elemento = rótulo exibido, traduzido.
 */
fun anunciarPaises(context: Context): List<Pair<String, String>> = listOf(
    "Brasil" to context.getString(R.string.country_brasil),
    "Argentina" to context.getString(R.string.country_argentina),
    "Uruguai" to context.getString(R.string.country_uruguai),
    "Paraguai" to context.getString(R.string.country_paraguai)
)

fun unidadesPreco(context: Context) = listOf(
    "" to context.getString(R.string.anunciar_unit_none),
    "por unidade" to context.getString(R.string.anunciar_unit_per_unit),
    "por kg" to context.getString(R.string.anunciar_unit_per_kg),
    "por saca (60kg)" to context.getString(R.string.anunciar_unit_per_sack),
    "por arroba" to context.getString(R.string.anunciar_unit_per_arroba),
    "por cabeça" to context.getString(R.string.anunciar_unit_per_head),
    "por hectare" to context.getString(R.string.anunciar_unit_per_hectare)
)

fun condicoes(context: Context) = listOf(
    "" to context.getString(R.string.anunciar_condition_none),
    "novo" to context.getString(R.string.anunciar_condition_new),
    "usado" to context.getString(R.string.anunciar_condition_used)
)

val MOEDAS = listOf("BRL", "ARS", "UYU", "PYG")

/** Espelha o zod schema (schema.ts) e os campos validados por handleNext de cada step do site. */
object AnuncioValidation {
    fun step1Errors(context: Context, v: AnuncioFormValues, subcategoriaObrigatoria: Boolean): Map<String, String> = buildMap {
        if (v.titulo.trim().length !in 5..100) put("titulo", context.getString(R.string.anunciar_err_title_length))
        if (v.categoria.isNullOrBlank()) put("categoria", context.getString(R.string.anunciar_err_category_required))
        if (subcategoriaObrigatoria && v.subcategoria.isNullOrBlank()) put("subcategoria", context.getString(R.string.anunciar_err_subcategory_required))
        if (v.descricao.trim().length !in 10..5000) put("descricao", context.getString(R.string.anunciar_err_description_length))
        val precoNormalizado = v.preco.replace(",", ".").toDoubleOrNull()
        if (v.preco.isNotBlank() && (precoNormalizado == null || precoNormalizado < 0)) put("preco", context.getString(R.string.anunciar_err_price_invalid))
    }

    fun step2Errors(context: Context, v: AnuncioFormValues): Map<String, String> = buildMap {
        if (v.pais.isBlank()) put("pais", context.getString(R.string.anunciar_err_country_required))
        if (v.estado.isNullOrBlank()) put("estado", context.getString(R.string.anunciar_err_state_required))
        if (v.cidade.isBlank()) put("cidade", context.getString(R.string.anunciar_err_city_required))
    }
}

/** user_id nunca vem daqui — sempre setado pelo repository a partir da sessão, mesma defesa do site. */
fun buildAdPayload(v: AnuncioFormValues, status: String): AdUpdatePayload = AdUpdatePayload(
    titlePt = v.titulo.trim(),
    description = v.descricao.trim(),
    categoryId = v.categoria!!,
    subcategoryId = v.subcategoria?.ifBlank { null },
    purpose = v.finalidade,
    price = v.preco.replace(",", ".").toDoubleOrNull(),
    currency = v.moeda,
    priceUnitPt = v.unidadePreco?.ifBlank { null },
    country = v.pais,
    state = v.estado.orEmpty(),
    city = v.cidade.trim(),
    negotiable = v.aNegociar,
    condition = v.condicao?.ifBlank { null },
    status = status,
    images = v.fotos,
    videoUrl = v.video,
)
