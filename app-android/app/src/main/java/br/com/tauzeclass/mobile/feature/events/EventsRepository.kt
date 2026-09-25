package br.com.tauzeclass.mobile.feature.events

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Singleton

private const val EVENT_COLUMNS =
    "id, title, title_es, date, image, location_str, location_str_es, organizer, organizer_es, link, featured, created_at"

@Singleton
class EventsRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    /**
     * RLS pública (SELECT true), confirmado ao vivo sem sessão. Dataset
     * pequeno (poucas dezenas de linhas) — busca tudo (limit 50, igual ao
     * site) e filtra a busca por texto no client, em vez de 4 queries
     * paralelas com .ilike() como o site faz — simplificação deliberada,
     * não incorreta, dado o tamanho real da tabela.
     */
    suspend fun getEvents(filters: EventFilters = EventFilters()): List<EventoAgro> {
        val all = supabase.postgrest.from("eventos").select(Columns.raw(EVENT_COLUMNS)) {
            limit(50)
        }.decodeList<EventoAgro>()
        val filtered = if (filters.search.isBlank()) all else {
            val q = filters.search.trim().lowercase()
            all.filter {
                it.title.lowercase().contains(q) ||
                    it.titleEs?.lowercase()?.contains(q) == true ||
                    it.locationStr?.lowercase()?.contains(q) == true ||
                    it.locationStrEs?.lowercase()?.contains(q) == true
            }
        }
        val today = LocalDate.now()
        // Futuros primeiro (ordenados por data), passados no fim — mesma lógica de page.tsx.
        return filtered.sortedWith(
            compareBy<EventoAgro> { it.isPast(today) }.thenBy { parseEventDate(it.date, today) ?: LocalDate.MAX }
        )
    }

    suspend fun getEventById(id: String): EventoAgro? =
        supabase.postgrest.from("eventos").select(Columns.raw(EVENT_COLUMNS)) {
            filter { eq("id", id) }
        }.decodeSingleOrNull()

    suspend fun getUpcomingEvents(limit: Int = 5): List<EventoAgro> {
        val today = LocalDate.now()
        return getEvents().filter { !it.isPast(today) }.take(limit)
    }
}
