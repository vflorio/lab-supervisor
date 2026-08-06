plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "com.vflorio.supervisoragent"
    compileSdk {
        version = release(36)
    }

    defaultConfig {
        applicationId = "com.vflorio.supervisoragent"
        // Android 13
        minSdk = 33
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // Chiave condivisa e versionata, non il debug.keystore per-macchina: cio' che conta per gli
    // aggiornamenti non e' debug-vs-release ma se la chiave e' la stessa gia' installata. Chiave
    // diversa => uninstall forzato => WRITE_SECURE_SETTINGS perso su tutti i device. Firmando
    // debug e release con questa, qualunque build da qualunque macchina resta intercambiabile.
    // Credenziali in chiaro di proposito: la rete del lab e' isolata e la chiave non protegge
    // nulla di distribuito.
    signingConfigs {
        create("supervisor") {
            storeFile = rootProject.file("keystore/supervisor-agent.p12")
            storePassword = "supervisor"
            keyAlias = "supervisor-agent"
            keyPassword = "supervisor"
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("supervisor")
            optimization {
                enable = false
            }
        }
        debug {
            signingConfig = signingConfigs.getByName("supervisor")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}