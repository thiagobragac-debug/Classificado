package br.com.tauzeclass.mobile.feature.institucional

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** institutional_pages — confirmado ao vivo via curl real no REST do Supabase (RLS pública de leitura). */
@Serializable
data class InstitutionalPage(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    @SerialName("group_name") val groupName: String,
    @SerialName("icon_name") val iconName: String? = null,
    @SerialName("order_idx") val orderIdx: Int = 0,
    val content: String,
    @SerialName("title_es") val titleEs: String? = null,
    @SerialName("subtitle_es") val subtitleEs: String? = null,
    @SerialName("content_es") val contentEs: String? = null,
    @SerialName("group_name_es") val groupNameEs: String? = null,
)
