$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$token = (Get-Clipboard -Raw).Trim()
if (-not ($token -match "^EA[A-Za-z0-9]+$")) {
  Write-Host "В буфере обмена нет Meta-токена."
  Write-Host "1. Meta Business -> System user nn -> Сгенерировать маркер"
  Write-Host "2. Скопируйте токен (Ctrl+C)"
  Write-Host "3. Запустите этот скрипт снова"
  exit 1
}

$publicBase = if ($args[0]) { $args[0] } else { "https://light-crm-backend.onrender.com" }
$tokenFile = Join-Path $env:TEMP "light-crm-meta-token.txt"
Set-Content -Path $tokenFile -Value $token -NoNewline -Encoding utf8

Write-Host "Применяю токен и подключаю +7 700 313 1055 к CRM..."
docker compose cp $tokenFile backend:/tmp/meta-token.txt
docker compose exec backend sh -c "META_TOKEN_INPUT=`$(cat /tmp/meta-token.txt) npm run apply:meta-token -- $publicBase `$(cat /tmp/meta-token.txt)"
Remove-Item $tokenFile -Force
