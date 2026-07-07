$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$ManifestPath = Join-Path $Root "android\app\src\main\AndroidManifest.xml"
$TemplatePath = Join-Path $Root "templates\android-permissions.xml"
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $ManifestPath)) {
  Write-Host "AndroidManifest.xml not found, skip permissions patch"
  exit 0
}

$template = [System.IO.File]::ReadAllText($TemplatePath).TrimStart([char]0xFEFF)
$manifest = [System.IO.File]::ReadAllText($ManifestPath).TrimStart([char]0xFEFF)

if ($manifest -match 'android\.permission\.RECORD_AUDIO') {
  Write-Host "Android permissions already applied"
  exit 0
}

$manifest = $manifest -replace '(<uses-permission android:name="android\.permission\.INTERNET" />)', "`$1`n$template"
[System.IO.File]::WriteAllText($ManifestPath, $manifest, $Utf8NoBom)
Write-Host "Android permissions applied to AndroidManifest.xml"
