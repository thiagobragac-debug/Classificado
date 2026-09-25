package br.com.tauzeclass.mobile.feature.ads

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import br.com.tauzeclass.mobile.R

/**
 * Nome de exibição (pt/es via resource) por id real de categoria — confirmado ao vivo via
 * curl direto em /rest/v1/categories (id, name_pt) contra o banco de
 * produção, não suposto. Usado como fallback rápido em telas que não
 * carregam a lista completa de `Category` (Home, Anúncio, Favoritos) — a
 * tela de Listagem usa a lista real carregada do banco em vez deste mapa.
 *
 * Virou @Composable (em vez de receber um Context) porque o único call site (AdCard.kt) já é
 * interno a um Composable — troca contida, sem ripple pra outros arquivos.
 */
@Composable
fun categoryDisplayNamePt(categoryId: String): String = when (categoryId) {
    "cat-bovinos" -> stringResource(R.string.cat_bovinos)
    "cat-equinos" -> stringResource(R.string.cat_equinos)
    "cat-suinos" -> stringResource(R.string.cat_suinos)
    "caprinos" -> stringResource(R.string.cat_caprinos)
    "cat-ovinos" -> stringResource(R.string.cat_ovinos)
    "cat-aves" -> stringResource(R.string.cat_aves)
    "cat-aquicult" -> stringResource(R.string.cat_aquicultura)
    "cat-insumos" -> stringResource(R.string.cat_insumos)
    "medicamentos" -> stringResource(R.string.cat_medicamentos)
    "cat-genetica" -> stringResource(R.string.cat_genetica)
    "cat-imoveis" -> stringResource(R.string.cat_imoveis_rurais)
    "cat-maquinas" -> stringResource(R.string.cat_maquinas)
    "cat-servicos" -> stringResource(R.string.cat_servicos)
    "cat-outros" -> stringResource(R.string.cat_outros)
    else -> stringResource(R.string.cat_outros)
}
