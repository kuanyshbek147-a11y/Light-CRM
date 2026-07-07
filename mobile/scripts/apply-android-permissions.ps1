$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$ManifestPath = Join-Path $Root "android\app\src\main\AndroidManifest.xml"
$TemplatePath = Join-Path $Root "templates\android-permissions.xml"

if (-not (Test-Path $ManifestPath)) {
  Write-Host "AndroidManifest.xml not found, skip permissions patch"
  exit 0
}

$template = Get-Content $TemplatePath -Raw
$manifest = Get-Content $ManifestPath -Raw

if ($manifest -match 'android\.permission\.RECORD_AUDIO') {
  Write-Host "Android permissions already applied"
  exit 0
}

$manifest = $manifest -replace '(<uses-permission android:name="android\.permission\.INTERNET" />)', "`$1`n$template"
Set-Content -Path $ManifestPath -Value $manifest -Encoding UTF8
Write-Host "Android permissions applied to AndroidManifest.xml"
