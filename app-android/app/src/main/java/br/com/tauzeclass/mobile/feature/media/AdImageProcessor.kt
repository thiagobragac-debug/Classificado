package br.com.tauzeclass.mobile.feature.media

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Typeface
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import br.com.tauzeclass.mobile.R
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream

/**
 * Réplica do pipeline de imagem do site (StepPhotos.tsx): resize pro lado
 * maior = 1280px (sem upscale), marca d'água "Tauze Class" no canto
 * inferior direito, reencode JPEG qualidade 0.82. Android precisa
 * adicionalmente normalizar a orientação EXIF antes de desenhar — achado
 * durante esta implementação, não citado na pesquisa original:
 * BitmapFactory não aplica rotação EXIF automaticamente (diferente de
 * <canvas>/createImageBitmap no browser, que já corrige sozinho); sem
 * isso, fotos tiradas em retrato por muitos Android apareceriam giradas
 * 90° no anúncio.
 */
object AdImageProcessor {
    private const val MAX_DIMENSION_PX = 1280
    private const val JPEG_QUALITY = 82
    const val MAX_SOURCE_BYTES = 10 * 1024 * 1024 // 10MB pré-compressão, mesmo teto do site

    class ImageTooLargeException(message: String) : Exception(message)
    class InvalidImageException(message: String) : Exception(message)

    fun process(context: Context, uri: Uri): ByteArray {
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            ?: throw InvalidImageException(context.getString(R.string.media_err_invalid_image))
        if (bytes.size > MAX_SOURCE_BYTES) throw ImageTooLargeException(context.getString(R.string.media_err_image_too_large))

        var bitmap = decodeSampled(bytes, MAX_DIMENSION_PX) ?: throw InvalidImageException(context.getString(R.string.media_err_invalid_image))
        bitmap = fixExifRotation(bytes, bitmap)
        bitmap = scaleDown(bitmap, MAX_DIMENSION_PX)
        val mutable = bitmap.copy(Bitmap.Config.ARGB_8888, true)
        drawWatermark(mutable)

        val out = ByteArrayOutputStream()
        mutable.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
        return out.toByteArray()
    }

    /**
     * BUG CORRIGIDO (auditoria ao vivo, 2026-09-25): decodificar em resolução
     * total ANTES de reduzir (o que scaleDown() fazia sozinho) aloca um
     * Bitmap ARGB_8888 proporcional aos PIXELS da foto, não ao tamanho do
     * arquivo comprimido — câmeras 50-108MP comuns em Android popular no
     * Brasil produzem JPEGs bem abaixo do teto de MAX_SOURCE_BYTES (10MB)
     * mas que decodificam pra centenas de MB, causando OutOfMemoryError
     * (que estende Error, não Exception — nenhum catch(Exception) do app
     * intercepta). Padrão oficial do Android (inJustDecodeBounds +
     * inSampleSize, developer.android.com/topic/performance/graphics/load-bitmap):
     * primeiro lê só as dimensões (sem alocar pixel nenhum), calcula a maior
     * potência de 2 que já deixa a imagem "perto o bastante" do alvo, e só
     * então decodifica de verdade nesse tamanho reduzido — scaleDown() continua
     * fazendo o ajuste fino exato depois, sem mudar comportamento visual.
     */
    private fun decodeSampled(bytes: ByteArray, maxDim: Int): Bitmap? {
        val boundsOptions = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, boundsOptions)

        val options = BitmapFactory.Options().apply {
            inSampleSize = calculateInSampleSize(boundsOptions.outWidth, boundsOptions.outHeight, maxDim)
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }

    private fun calculateInSampleSize(width: Int, height: Int, reqSize: Int): Int {
        if (width <= 0 || height <= 0) return 1
        var inSampleSize = 1
        var halfWidth = width / 2
        var halfHeight = height / 2
        while (halfWidth / inSampleSize >= reqSize && halfHeight / inSampleSize >= reqSize) {
            inSampleSize *= 2
        }
        return inSampleSize
    }

    private fun scaleDown(bitmap: Bitmap, maxDim: Int): Bitmap {
        val ratio = maxDim.toFloat() / maxOf(bitmap.width, bitmap.height)
        if (ratio >= 1f) return bitmap
        return Bitmap.createScaledBitmap(bitmap, (bitmap.width * ratio).toInt(), (bitmap.height * ratio).toInt(), true)
    }

    /** Canto inferior direito, réplica de StepPhotos.tsx: branco 70% opacidade, sombra preta, fonte bold ~4% da largura. */
    private fun drawWatermark(bitmap: Bitmap) {
        val canvas = Canvas(bitmap)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.argb((0.7f * 255).toInt(), 255, 255, 255)
            textSize = bitmap.width * 0.04f
            typeface = Typeface.DEFAULT_BOLD
            setShadowLayer(4f, 1f, 1f, Color.argb((0.6f * 255).toInt(), 0, 0, 0))
        }
        val text = "Tauze Class"
        val margin = bitmap.width * 0.03f
        canvas.drawText(text, bitmap.width - paint.measureText(text) - margin, bitmap.height - margin, paint)
    }

    private fun fixExifRotation(bytes: ByteArray, bitmap: Bitmap): Bitmap {
        val exif = ExifInterface(ByteArrayInputStream(bytes))
        val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        val degrees = when (orientation) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> return bitmap
        }
        val matrix = Matrix().apply { postRotate(degrees) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
}
