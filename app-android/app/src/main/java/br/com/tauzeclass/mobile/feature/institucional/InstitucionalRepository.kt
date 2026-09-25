package br.com.tauzeclass.mobile.feature.institucional

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import javax.inject.Inject
import javax.inject.Singleton

private const val INSTITUTIONAL_COLUMNS =
    "id, title, subtitle, group_name, icon_name, order_idx, content, title_es, subtitle_es, content_es, group_name_es"

@Singleton
class InstitucionalRepository @Inject constructor(
    private val supabase: SupabaseClient
) {
    /** RLS pública — mesma leitura sem sessão confirmada via curl no levantamento. */
    suspend fun getPages(): List<InstitutionalPage> =
        supabase.postgrest.from("institutional_pages").select(Columns.raw(INSTITUTIONAL_COLUMNS)) {
            order("order_idx", Order.ASCENDING)
            order("id", Order.ASCENDING)
        }.decodeList()
}
