import java.util.Properties

// Kotlin embutido no com.android.application (AGP 9.0+) — sem plugin
// kotlin-android separado (aplicá-lo quebra o build: "The
// 'org.jetbrains.kotlin.android' plugin is no longer required for Kotlin
// support since AGP 9.0", confirmado ao vivo 2026-09-09). kapt clássico
// (org.jetbrains.kotlin.kapt) também é incompatível com Kotlin embutido —
// usa-se com.android.legacy-kapt no lugar, mesma versão do AGP.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)   // compose-compiler; versão = versão do Kotlin (2.4.20)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.legacy.kapt)      // processamento de anotação do Hilt (substitui kotlin-kapt)
    alias(libs.plugins.hilt.android)
}

// Lê SUPABASE_ANON_KEY de local.properties (arquivo NUNCA versionado) e expõe
// como BuildConfig field. A anon key jamais fica hardcoded no fonte.
val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        localPropertiesFile.inputStream().use { load(it) }
    }
}

android {
    namespace = "br.com.tauzeclass.mobile"
    compileSdk = 37 // obrigatório pelo Compose 1.12 (BOM 2026.08.00)

    defaultConfig {
        applicationId = "br.com.tauzeclass.mobile"
        minSdk = 24    // paridade com mobile/android (Capacitor) — variables.gradle
        targetSdk = 36 // mínimo exigido pela Google Play desde 31/ago/2026

        versionCode = 1
        versionName = "1.0.0"

        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"https://rfzuzuobwuanmbrcthqe.supabase.co\""
        )
        buildConfigField(
            "String",
            "SUPABASE_ANON_KEY",
            "\"${localProperties.getProperty("SUPABASE_ANON_KEY", "")}\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // supabase-kt exige minSdk 26 nativamente (documentado oficialmente
        // em supabase.com/docs/reference/kotlin) — este projeto usa minSdk
        // 24 (paridade com mobile/android), então precisa de core library
        // desugaring pra rodar em Android 7.x/8.0 de verdade. Sem isso o
        // app pode até compilar e funcionar no emulador (Android 16), mas
        // falharia silenciosamente em aparelho real com API 24/25.
        isCoreLibraryDesugaringEnabled = true
    }
    // Com Kotlin embutido no AGP, kotlin.compilerOptions.jvmTarget usa
    // automaticamente compileOptions.targetCompatibility acima — não se
    // declara um bloco kotlin{}/kotlinOptions{} separado aqui (isso já
    // causou "Cannot add extension with name 'kotlin'" nesta sessão).

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "META-INF/DEPENDENCIES"
            )
        }
    }
}

dependencies {
    // --- Compose (BOM controla todas as versões dos artefatos abaixo) ---
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.compose.ui.text.google.fonts) // Sora/Inter via Google Fonts provider

    // --- AndroidX baseline ---
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appcompat) // AppCompatDelegate.setApplicationLocales() — idioma por app (PT/ES)
    implementation(libs.navigation.compose)
    implementation(libs.hilt.navigation.compose)

    // --- Hilt ---
    implementation(libs.hilt.android)
    kapt(libs.hilt.compiler)

    // --- Supabase (BOM controla postgrest-kt/auth-kt/realtime-kt/storage-kt) ---
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.postgrest)
    implementation(libs.supabase.auth)
    implementation(libs.supabase.realtime)
    implementation(libs.supabase.storage)
    implementation(libs.ktor.client.okhttp) // engine HTTP — necessário à parte da BOM; OkHttp (não Android) por suportar WebSocket, exigido pelo Realtime
    coreLibraryDesugaring(libs.desugar.jdk.libs)

    // --- Credential Manager / Sign in with Google ---
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)

    // --- Imagens ---
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.androidx.exifinterface) // normalização de orientação EXIF no pipeline de imagem do Anunciar

    // --- Serialização ---
    implementation(libs.kotlinx.serialization.json)
}
