# Sync selected env vars from local secret files to Render (light-crm-backend).
# Requires RENDER_API_KEY in infra/platform.secrets.env or environment.
# Usage:
#   powershell -File infra/scripts/sync-render-env.ps1
#   powershell -File infra/scripts/sync-render-env.ps1 -Keys INSTAGRAM_APP_ID,INSTAGRAM_APP_SECRET
#   powershell -File infra/scripts/sync-render-env.ps1 -TriggerDeploy

param(
  [string[]]$Keys = @(
    "INSTAGRAM_APP_ID",
    "INSTAGRAM_APP_SECRET",
    "INSTAGRAM_OAUTH_REDIRECT_URI",
    "INSTAGRAM_API_VERSION",
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_BUSINESS_ACCOUNT_ID",
    "WHATSAPP_APP_ID",
    "WHATSAPP_APP_SECRET",
    "WHATSAPP_VERIFY_TOKEN",
    "WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID",
    "PUBLIC_BASE_URL",
    "EMAIL_CREDENTIALS_KEY",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_MODEL",
    "META_ADS_ACCESS_TOKEN",
    "META_ADS_AD_ACCOUNT_ID",
    "META_ADS_PAGE_ID",
    "META_ADS_API_VERSION",
    "ADS_DEFAULT_LINK_URL"
  ),
  [string]$ServiceId = "",
  [string]$ServiceName = "light-crm-backend",
  [switch]$TriggerDeploy,
  [switch]$ListOnly
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path

function Read-EnvFile([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $name = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$name] = $value
  }
  return $map
}

$platform = Read-EnvFile (Join-Path $Root "infra\platform.secrets.env")
$meta = Read-EnvFile (Join-Path $Root "infra\meta.secrets.env")
$local = Read-EnvFile (Join-Path $Root "infra\.env")
$merged = @{}
foreach ($src in @($local, $meta, $platform)) {
  foreach ($k in $src.Keys) { $merged[$k] = $src[$k] }
}

$apiKey = $env:RENDER_API_KEY
if (-not $apiKey) { $apiKey = $merged["RENDER_API_KEY"] }
if (-not $apiKey) {
  throw "RENDER_API_KEY not found. Add it to infra/platform.secrets.env"
}

$headers = @{
  Authorization = "Bearer $apiKey"
  Accept = "application/json"
  "Content-Type" = "application/json"
}

if (-not $ServiceId) {
  $ServiceId = $merged["RENDER_SERVICE_ID"]
}
if (-not $ServiceId) {
  Write-Host "Looking up Render service '$ServiceName'..."
  $services = Invoke-RestMethod -Uri "https://api.render.com/v1/services?limit=50" -Headers $headers -Method GET
  foreach ($item in $services) {
    $svc = if ($item.service) { $item.service } else { $item }
    $url = ""
    if ($svc.serviceDetails -and $svc.serviceDetails.url) { $url = [string]$svc.serviceDetails.url }
    if ($svc.name -eq $ServiceName -or $url -match "light-crm-backend") {
      $ServiceId = $svc.id
      break
    }
  }
  if (-not $ServiceId) {
    $names = @()
    foreach ($item in $services) {
      $svc = if ($item.service) { $item.service } else { $item }
      $names += "$($svc.id) $($svc.name)"
    }
    throw "Service '$ServiceName' not found. Available:`n$($names -join "`n")"
  }
  Write-Host "Service ID: $ServiceId"
}

if ($ListOnly) {
  $vars = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/env-vars" -Headers $headers -Method GET
  foreach ($item in $vars) {
    $row = if ($item.envVar) { $item.envVar } else { $item }
    $mask = if ($row.value) { "***" } else { "" }
    Write-Host ("{0}={1}" -f $row.key, $mask)
  }
  exit 0
}

# Allow -Keys "A,B,C" from cmd.exe / single-string callers
$normalizedKeys = @()
foreach ($key in $Keys) {
  foreach ($part in ($key -split ",")) {
    $trimmed = $part.Trim()
    if ($trimmed) { $normalizedKeys += $trimmed }
  }
}

$updated = @()
foreach ($key in $normalizedKeys) {
  if (-not $merged.ContainsKey($key)) {
    Write-Host "skip $key (not in local secrets)"
    continue
  }
  $value = [string]$merged[$key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    Write-Host "skip $key (empty)"
    continue
  }
  $body = @{ value = $value } | ConvertTo-Json -Compress
  $uri = "https://api.render.com/v1/services/$ServiceId/env-vars/$([uri]::EscapeDataString($key))"
  Invoke-RestMethod -Uri $uri -Headers $headers -Method PUT -Body $body | Out-Null
  Write-Host "set $key"
  $updated += $key
}

if ($updated.Count -eq 0) {
  Write-Host "Nothing to update."
  exit 0
}

Write-Host ("Updated {0} vars: {1}" -f $updated.Count, ($updated -join ", "))

# Persist service id for next runs
$platformPath = Join-Path $Root "infra\platform.secrets.env"
if (Test-Path $platformPath) {
  $raw = Get-Content -LiteralPath $platformPath -Raw -Encoding UTF8
  if ($raw -match "(?m)^RENDER_SERVICE_ID=") {
    $raw = [regex]::Replace($raw, "(?m)^RENDER_SERVICE_ID=.*$", "RENDER_SERVICE_ID=$ServiceId")
  } else {
    $raw = $raw.TrimEnd() + "`r`nRENDER_SERVICE_ID=$ServiceId`r`n"
  }
  Set-Content -LiteralPath $platformPath -Value $raw -Encoding UTF8 -NoNewline
}

if ($TriggerDeploy) {
  Write-Host "Triggering deploy..."
  $deployBody = @{ clearCache = "do_not_clear" } | ConvertTo-Json -Compress
  $deployResult = Invoke-RestMethod -Uri "https://api.render.com/v1/services/$ServiceId/deploys" -Headers $headers -Method POST -Body $deployBody
  $deployId = if ($deployResult.deploy.id) { $deployResult.deploy.id } else { $deployResult.id }
  Write-Host "Deploy started: $deployId"
}
