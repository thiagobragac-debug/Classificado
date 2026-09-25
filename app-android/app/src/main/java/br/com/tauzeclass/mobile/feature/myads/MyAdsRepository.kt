package br.com.tauzeclass.mobile.feature.myads

import android.content.Context
import br.com.tauzeclass.mobile.R
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import javax.inject.Inject
import javax.inject.Singleton

private const val MY_AD_COLUMNS =
    "id, slug, title_pt, title_es, price, currency, status, featured, images, category_id, city, state, country, created_at, views_count, expires_at"

@Singleton
class MyAdsRepository @Inject constructor(
    private val supabase: SupabaseClient,
    @ApplicationContext private val appContext: Context
) {
    private fun uid() = supabase.auth.currentUserOrNull()?.id ?: error(appContext.getString(R.string.common_session_not_found))

    suspend fun getMyAds(filter: AdStatusFilter, page: Int, pageSize: Int = 10): Pair<List<MyAd>, Long> {
        val from = ((page - 1) * pageSize).toLong()
        val to = from + pageSize - 1
        val uid = uid()
        val result = supabase.postgrest.from("ads").select(Columns.raw(MY_AD_COLUMNS)) {
            count(Count.EXACT)
            filter {
                eq("user_id", uid)
                if (filter.dbValue != null) {
                    eq("status", filter.dbValue)
                } else {
                    // BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): sem isso, a aba
                    // "Todos" (dbValue=null) reexpunha anúncios soft-deletados e
                    // permitia ressuscitá-los via edição — mesmo bug já corrigido no
                    // site (nextjs-app/lib/supabase.ts, .not('status','eq','deleted')
                    // aplicado incondicionalmente). Aplicado aqui só no ramo "sem
                    // filtro de status" pra não alterar o comportamento dos outros
                    // filtros (que já pedem um status específico, nunca 'deleted').
                    neq("status", "deleted")
                }
            }
            order("created_at", Order.DESCENDING)
            range(from, to)
        }
        return result.decodeList<MyAd>() to (result.countOrNull() ?: 0L)
    }

    /** Pausar/reativar — reativar pode ser barrado por enforce_ad_quota (P0001), tratado no ViewModel. */
    suspend fun toggleStatus(adId: String, newStatus: String) {
        val uid = uid()
        supabase.postgrest.from("ads").update({ set("status", newStatus) }) {
            filter { eq("id", adId); eq("user_id", uid) }
        }
    }

    /** Soft-delete — status='deleted', igual ao site (NUNCA usar DELETE físico, mesmo que uma policy antiga permita). */
    suspend fun deleteAd(adId: String) = toggleStatus(adId, "deleted")
}
