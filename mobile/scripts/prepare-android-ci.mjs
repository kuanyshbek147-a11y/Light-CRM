// Linux/macOS-версия apply-android-permissions.ps1 + patch-android-gradle.ps1 — для сборки APK в GitHub Actions.
// Запускать после `npx cap add android`, до `npx cap sync android`.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(path, "utf8").replace(/^﻿/, "");

const manifestPath = join(root, "android/app/src/main/AndroidManifest.xml");
const template = read(join(root, "templates/android-permissions.xml"));
const manifest = read(manifestPath);
if (!manifest.includes("android.permission.RECORD_AUDIO")) {
  const patched = manifest.replace(
    /(<uses-permission android:name="android\.permission\.INTERNET" \/>)/,
    `$1\n${template}`
  );
  if (patched === manifest) {
    throw new Error("INTERNET permission not found in AndroidManifest.xml");
  }
  writeFileSync(manifestPath, patched);
  console.log("Android permissions applied");
}

const variablesPath = join(root, "android/variables.gradle");
if (existsSync(variablesPath)) {
  const vars = read(variablesPath);
  if (!vars.includes("kotlin_version")) {
    writeFileSync(variablesPath, vars.replace(/(ext \{)/, "$1\n    kotlin_version = '1.9.24'"));
    console.log("Patched variables.gradle: kotlin_version");
  }
}

const microphonePath = join(root, "node_modules/@mozartec/capacitor-microphone/android/build.gradle");
if (existsSync(microphonePath)) {
  let microphone = read(microphonePath);
  if (!microphone.includes('jvmTarget = "17"')) {
    const kotlinPatch = `

    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        kotlinOptions {
            jvmTarget = "17"
        }
    }`;
    microphone = /compileOptions \{/.test(microphone)
      ? microphone.replace(/(compileOptions \{[\s\S]*?\r?\n {4}\})/, `$1${kotlinPatch}`)
      : microphone.replace(/(android \{)/, `$1${kotlinPatch}`);
    microphone = microphone.replace(
      `ext.kotlin_version = project.hasProperty("kotlin_version") ? rootProject.ext.kotlin_version : '1.9.10'`,
      `ext.kotlin_version = project.hasProperty('kotlin_version') ? rootProject.ext.kotlin_version : '1.9.24'`
    );
    writeFileSync(microphonePath, microphone);
    console.log("Patched @mozartec/capacitor-microphone android/build.gradle");
  }
}
