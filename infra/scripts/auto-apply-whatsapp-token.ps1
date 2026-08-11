$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$publicBase = if ($args[0]) { $args[0] } else { "https://light-crm-backend.onrender.com" }
$systemUserId = if ($args[1]) { $args[1] } else { "61591129104428" }
$businessId = if ($args[2]) { $args[2] } else { "813111725070066" }

$url = "https://business.facebook.com/latest/settings/system_users?business_id=$businessId&selected_user_id=$systemUserId"
Write-Host "Opening Meta system user nn..."
Start-Process $url
Write-Host "Waiting for token in clipboard (5 min). Click Generate token and copy it."

$deadline = (Get-Date).AddMinutes(5)
$token = ""

while ((Get-Date) -lt $deadline) {
  $clip = (Get-Clipboard -Raw -ErrorAction SilentlyContinue).Trim()
  if ($clip -match "^EA[A-Za-z0-9]{50,}$") {
    $token = $clip
    break
  }
  Start-Sleep -Seconds 2
}

if (-not $token) {
  Write-Host "No token in clipboard within 5 minutes."
  exit 1
}

Write-Host "Token detected. Connecting CRM..."
$tokenFile = Join-Path $env:TEMP "light-crm-meta-token.txt"
Set-Content -Path $tokenFile -Value $token -NoNewline -Encoding utf8
docker compose cp $tokenFile backend:/tmp/meta-token.txt
docker compose exec backend sh -c "META_TOKEN_INPUT=`$(cat /tmp/meta-token.txt) npm run apply:meta-token -- $publicBase `$(cat /tmp/meta-token.txt)"
Remove-Item $tokenFile -Force
Write-Host "Done."
