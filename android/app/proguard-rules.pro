# StreamVault release ProGuard / R8 rules.
# Consumer rules from Expo, React Native, and other deps are merged automatically.

# --- React Native core ---
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.common.internal.DoNotStrip *;
}
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.fabric.** { *; }
-keepclassmembers class * {
    @com.facebook.react.uimanager.annotations.ReactProp *;
    @com.facebook.react.uimanager.annotations.ReactPropGroup *;
}
-keepclassmembers class * {
    native <methods>;
}

# --- Expo Modules ---
-keep @expo.modules.core.interfaces.DoNotStrip class *
-keepclassmembers class * {
    @expo.modules.core.interfaces.DoNotStrip *;
}
-keep class expo.modules.** { *; }
-keepnames class * extends expo.modules.core.BasePackage
-keepnames class * implements expo.modules.core.interfaces.Package
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class * implements expo.modules.kotlin.records.Record { *; }
-keep class * extends expo.modules.kotlin.sharedobjects.SharedObject { *; }
-keep enum * implements expo.modules.kotlin.types.Enumerable { *; }
-keepnames class kotlin.Pair

# StreamVault NewPipe native module
-keep class expo.modules.streamvaultnewpipe.** { *; }

# --- NewPipe Extractor + Rhino (Rhino) ---
-keep class org.schabi.newpipe.extractor.** { *; }
-keep class org.mozilla.javascript.** { *; }
-keep class org.mozilla.classfile.ClassFileWriter { *; }
-dontwarn org.mozilla.javascript.tools.**
-dontwarn org.schabi.newpipe.extractor.**
# Rhino optional desktop/JDK APIs (not on Android).
-dontwarn jdk.dynalink.**
-dontwarn javax.script.**
-dontwarn java.beans.**

# --- Jsoup (NewPipe dependency) optional re2j backend ---
-dontwarn com.google.re2j.**

# --- Google Mobile Ads + UMP consent ---
-keep class com.google.android.gms.ads.** { *; }
-keep class com.google.ads.** { *; }
-keep class com.google.android.ump.** { *; }
-keep class io.invertase.googlemobileads.** { *; }
-dontwarn com.google.android.gms.**

# --- Meta Audience Network (AdMob mediation) ---
-keep class com.facebook.ads.** { *; }
-dontwarn com.facebook.ads.**

# --- Reanimated ---
-keep class com.swmansion.reanimated.** { *; }

# --- Worklets ---
-keep class com.swmansion.worklets.** { *; }

# --- MMKV ---
-keep class com.tencent.mmkv.** { *; }

# --- Nitro Modules / Nitro MMKV ---
-keep class com.margelo.nitro.** { *; }

# --- Hermes / JNI bridges used by native modules ---
-keepclassmembers class * {
    @com.facebook.jni.annotations.DoNotStrip *;
}
