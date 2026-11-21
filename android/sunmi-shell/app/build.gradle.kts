plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

android {
  namespace = "com.programasdteme.okapisunmi"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.programasdteme.okapisunmi"
    minSdk = 26
    targetSdk = 34
    versionCode = 1
    versionName = "1.0.0"
    buildConfigField("String", "APP_URL", "\"https://okapi.programasdteme.com\"")
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      proguardFiles(
        getDefaultProguardFile("proguard-android-optimize.txt"),
        "proguard-rules.pro",
      )
    }
    debug {
      applicationIdSuffix = ".debug"
      versionNameSuffix = "-debug"
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }

  kotlinOptions {
    jvmTarget = "17"
  }

  lint {
    checkReleaseBuilds = false
    abortOnError = false
  }

  buildFeatures {
    buildConfig = true
    aidl = true
  }

  sourceSets {
    getByName("main") {
      aidl.srcDirs("src/main/aidl")
    }
  }
}

dependencies {
  implementation("androidx.core:core-ktx:1.15.0")
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.webkit:webkit:1.12.1")
}
