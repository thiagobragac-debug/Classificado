package br.com.tauzeclass.mobile.feature.events

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.time.LocalDate

/**
 * public.eventos — colunas confirmadas ao vivo via REST (RLS pública de
 * leitura). NÃO existe coluna "description" — removida no site por não
 * haver dado real (mesma decisão aqui: não inventar um texto que não existe
 * no banco). `date` é texto livre em português (ex.: "2 - 6 fev 2026"), não
 * ISO — ver parseEventDate abaixo. `lat`/`lng` existem na tabela mas
 * nenhuma tela do site os usa (confirmado na pesquisa) — omitidos aqui.
 */
@Serializable
data class EventoAgro(
    val id: String,
    val title: String,
    @SerialName("title_es") val titleEs: String? = null,
    val date: String,
    val image: String? = null,
    @SerialName("location_str") val locationStr: String? = null,
    @SerialName("location_str_es") val locationStrEs: String? = null,
    val organizer: String? = null,
    @SerialName("organizer_es") val organizerEs: String? = null,
    val link: String? = null,
    val featured: Boolean = false,
    @SerialName("created_at") val createdAt: String? = null,
)

private val EVENT_MONTHS = mapOf(
    "jan" to 1, "fev" to 2, "mar" to 3, "abr" to 4, "mai" to 5, "jun" to 6,
    "jul" to 7, "ago" to 8, "set" to 9, "out" to 10, "nov" to 11, "dez" to 12,
)

/**
 * Adaptação (não port verbatim — a regex exata de lib/event-date.ts não foi
 * lida) do parser de data em texto livre PT: extrai o PRIMEIRO dia+mês
 * (início do evento) + ano se explícito na string; sem ano, assume o ano
 * atual e rola pro próximo se a data já ficou mais de 60 dias no passado
 * (mesma heurística de "virada de ano" citada na pesquisa sobre o site).
 */
fun parseEventDate(dateText: String, today: LocalDate = LocalDate.now()): LocalDate? {
    val yearMatch = Regex("(\\d{4})").find(dateText)
    val dayMonthMatch = Regex("(\\d{1,2})\\s*(?:de\\s+)?([a-zA-ZçÇãÃéÉ]+)").find(dateText) ?: return null
    val day = dayMonthMatch.groupValues[1].toIntOrNull() ?: return null
    val month = EVENT_MONTHS[dayMonthMatch.groupValues[2].take(3).lowercase()] ?: return null
    val year = yearMatch?.groupValues?.get(1)?.toIntOrNull() ?: today.year
    var date = runCatching { LocalDate.of(year, month, day) }.getOrNull() ?: return null
    if (yearMatch == null && date.isBefore(today.minusDays(60))) date = date.plusYears(1)
    return date
}

fun EventoAgro.isPast(today: LocalDate = LocalDate.now()): Boolean {
    val parsed = parseEventDate(date, today) ?: return false
    return parsed.isBefore(today)
}

data class EventFilters(val search: String = "")
