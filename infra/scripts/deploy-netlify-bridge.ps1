param(
  [string]$TunnelUrl = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$RedirectsPath = Join-Path $Root "frontend\public\_redirects"

Set-Location $Root

if (-not (docker compose -f infra/docker-compose.yml ps --status running 2>$null | Select-String "infra-backend")) {
  docker compose -f infra/docker-compose.yml --env-file infra/.env up -d db backend frontend
}

if (-not $TunnelUrl) {
  Write-Host "Запуск cloudflared-туннеля к localhost:4000..."
  $tunnelJob = Start-Job {
    npx --yes cloudflared tunnel --url http://localhost:4000 2>&1
  }
  Start-Sleep -Seconds 8
  $tunnelLog = Receive-Job $tunnelJob
  $match = [regex]::Match(($tunnelLog -join "`n"), "https://[a-z0-9-]+\.trycloudflare\.com")
  if (-not $match.Success) {
    throw "Не удалось получить URL туннеля. Запустите вручную: npx cloudflared tunnel --url http://localhost:4000"
  }
  $TunnelUrl = $match.Value.TrimEnd("/")
  Write-Host "Туннель: $TunnelUrl"
}

@"
/api/*  $TunnelUrl/api/:splat  200!
/*  /index.html  200
"@ | Set-Content -Path $RedirectsPath -Encoding utf8

Set-Location (Join-Path $Root "frontend")
npm run build

Write-Host ""
Write-Host "Готово. Дальше:"
Write-Host "1) git add frontend/public/_redirects && git commit && git push"
Write-Host "2) Или: npx netlify-cli deploy --prod --dir=dist"
Write-Host "3) Пока туннель жив, Netlify проксирует /api на $TunnelUrl"
