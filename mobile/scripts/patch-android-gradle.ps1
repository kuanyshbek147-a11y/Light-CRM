$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Android = Join-Path $Root "android"
$BuildGradle = Join-Path $Android "build.gradle"
$VariablesGradle = Join-Path $Android "variables.gradle"
$MicrophoneGradle = Join-Path $Root "node_modules\@mozartec\capacitor-microphone\android\build.gradle"
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, $Utf8NoBom)
}

function Read-Utf8([string]$Path) {
  return [System.IO.File]::ReadAllText($Path).TrimStart([char]0xFEFF)
}

if (Test-Path $BuildGradle) {
  $build = Read-Utf8 $BuildGradle
  if ($build -match 'subprojects \{ subproject ->') {
    $build = $build -replace '(?s)\r?\nsubprojects \{ subproject ->.*$', ''
    Write-Utf8NoBom $BuildGradle ($build.TrimEnd() + "`n")
    Write-Host "Removed broken subprojects block from build.gradle"
  }
}

if (Test-Path $VariablesGradle) {
  $vars = Read-Utf8 $VariablesGradle
  if ($vars -notmatch 'kotlin_version') {
    $vars = $vars -replace '(ext \{)', "`$1`n    kotlin_version = '1.9.24'"
    Write-Utf8NoBom $VariablesGradle $vars
    Write-Host "Patched variables.gradle: kotlin_version"
  }
}

if (-not (Test-Path $MicrophoneGradle)) {
  Write-Host "Microphone plugin not installed, skip plugin patch"
  exit 0
}

$microphone = Read-Utf8 $MicrophoneGradle
if ($microphone -match "jvmTarget = '17'") {
  Write-Host "Microphone plugin already patched"
  exit 0
}

$kotlinPatch = @"

    tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
        kotlinOptions {
            jvmTarget = "17"
        }
    }
"@

if ($microphone -match 'compileOptions \{') {
  $microphone = $microphone -replace '(?s)(compileOptions \{.*?\r?\n    \})', "`$1$kotlinPatch"
} else {
  $microphone = $microphone -replace '(android \{)', "`$1$kotlinPatch"
}

$microphone = $microphone -replace "ext\.kotlin_version = project\.hasProperty\(""kotlin_version""\) \? rootProject\.ext\.kotlin_version : '1\.9\.10'", "ext.kotlin_version = project.hasProperty('kotlin_version') ? rootProject.ext.kotlin_version : '1.9.24'"

Write-Utf8NoBom $MicrophoneGradle $microphone
Write-Host "Patched @mozartec/capacitor-microphone android/build.gradle"
