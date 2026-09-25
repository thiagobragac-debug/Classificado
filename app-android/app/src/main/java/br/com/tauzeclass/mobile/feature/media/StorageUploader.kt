package br.com.tauzeclass.mobile.feature.media

import android.content.Context
import android.net.Uri
import android.webkit.MimeTypeMap

/** Utilitário compartilhado (Perfil, Anunciar) — nunca usa file.name cru no path do Storage. */
object StorageUploader {
    private val ALLOWED_IMAGE_EXT = setOf("jpg", "jpeg", "png", "webp", "heic", "heif")
    private val ALLOWED_VIDEO_EXT = setOf("mp4", "mov", "webm")

    fun safeImageExt(context: Context, uri: Uri): String = guessExt(context, uri, ALLOWED_IMAGE_EXT, "jpg")

    fun safeVideoExt(context: Context, uri: Uri): String = guessExt(context, uri, ALLOWED_VIDEO_EXT, "mp4")

    private fun guessExt(context: Context, uri: Uri, allowed: Set<String>, fallback: String): String {
        val type = context.contentResolver.getType(uri)
        val guessed = MimeTypeMap.getSingleton().getExtensionFromMimeType(type)?.lowercase()
        return guessed?.takeIf { it in allowed } ?: fallback
    }

    /** Extrai o path relativo de dentro de uma public URL do Storage (".../storage/v1/object/public/<bucket>/<path>"). */
    fun pathFromPublicUrl(publicUrl: String, bucket: String): String? =
        publicUrl.substringAfter("/$bucket/", missingDelimiterValue = "").takeIf { it.isNotBlank() }
}
