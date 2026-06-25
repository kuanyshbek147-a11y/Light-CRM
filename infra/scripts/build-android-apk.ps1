$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Mobile = Join-Path $Root "mobile"
$JavaHome = "${env:ProgramFiles}\Android\Android Studio\jbr"
$AndroidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$OutDir = Join-Path $Root "releases"

if (-not (Test-Path $JavaHome)) {
  throw "Android Studio JBR not found at $JavaHome"
}
if (-not (Test-Path $AndroidHome)) {
  throw "Android SDK not found at $AndroidHome"
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:PATH = "$JavaHome\bin;$AndroidHome\platform-tools;$env:PATH"

Set-Location $Mobile
if (-not (Test-Path "node_modules")) {
  npm install
}
if (-not (Test-Path "android")) {
  npx cap add android
}

$gradleProps = Join-Path $Mobile "android\gradle.properties"
if (Test-Path $gradleProps) {
  $props = Get-Content $gradleProps -Raw
  if ($props -notmatch 'android\.overridePathCheck=true') {
    Add-Content $gradleProps "`nandroid.overridePathCheck=true"
  }
}

npm run apk

$apk = Join-Path $Mobile "android\app\build\outputs\apk\debug\app-debug.apk"
if (-not (Test-Path $apk)) {
  throw "APK not found: $apk"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$dest = Join-Path $OutDir "LightCRM-debug.apk"
Copy-Item $apk $dest -Force
Write-Host ""
Write-Host "APK ready:" $dest
Get-Item $dest | Select-Object FullName, Length, LastWriteTime
