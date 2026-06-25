$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$SecretsPath = Join-Path $Root "infra\meta.secrets.env"

function Read-Secret([string]$Name) {
  $line = Get-Content $SecretsPath | Where-Object { $_ -match "^$Name=" } | Select-Object -First 1
  if (-not $line) { return "" }
  return ($line -replace "^$Name=", "").Trim()
}

$apiBase = if ($args[0]) { $args[0].TrimEnd("/") } else { "https://light-crm-backend.onrender.com" }
$accessToken = Read-Secret "WHATSAPP_ACCESS_TOKEN"
$phoneNumberId = Read-Secret "WHATSAPP_PHONE_NUMBER_ID"
$wabaId = Read-Secret "WHATSAPP_BUSINESS_ACCOUNT_ID"
$appSecret = Read-Secret "WHATSAPP_APP_SECRET"

if (-not $accessToken -or -not $phoneNumberId -or -not $wabaId) {
  throw "Missing secrets in infra/meta.secrets.env"
}

Write-Host "Logging in to $apiBase ..."
$login = Invoke-RestMethod -Uri "$apiBase/api/auth/login" -Method POST -ContentType "application/json" -Body '{"login":"admin","password":"demo123"}' -TimeoutSec 120
$headers = @{
  Authorization = "Bearer $($login.token)"
  "Content-Type" = "application/json"
}

$body = @{
  accessToken = $accessToken
  phoneNumberId = $phoneNumberId
  wabaId = $wabaId
  webhookPublicBaseUrl = $apiBase
} | ConvertTo-Json

Write-Host "Bootstrapping WhatsApp on production..."
$result = Invoke-RestMethod -Uri "$apiBase/api/integrations/whatsapp/connect/bootstrap" -Method POST -Headers $headers -Body $body -TimeoutSec 120
$result | ConvertTo-Json -Depth 6

if ($appSecret) {
  Write-Host ""
  Write-Host "Render env reminder (set in dashboard if messaging fails without workspace):"
  Write-Host "WHATSAPP_ACCESS_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID"
}
