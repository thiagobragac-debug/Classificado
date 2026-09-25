// Nível: projeto (raiz) — apenas declara os plugins, sem aplicá-los aqui.
// Kotlin embutido no AGP 9.0+ (com.android.application) — sem plugin
// kotlin-android separado. Ver gradle/libs.versions.toml.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.legacy.kapt) apply false
    alias(libs.plugins.hilt.android) apply false
}
