$ErrorActionPreference = "Stop"

function New-SecurePassword([int]$Length = 20) {
  $chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#%*-_"
  $bytes = New-Object byte[] $Length
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$SecretsPath = Join-Path $Root "infra\platform.secrets.env"
$apiBase = if ($args[0]) { $args[0].TrimEnd("/") } else { "https://light-crm-backend.onrender.com" }
$login = if ($args[1]) { $args[1] } else { "superadmin" }
$currentPassword = if ($args[2]) { $args[2] } else { "superadmin123" }
$newPassword = if ($args[3]) { $args[3] } else { New-SecurePassword 22 }

Write-Host "Logging in as $login on $apiBase ..."
$auth = Invoke-RestMethod -Uri "$apiBase/api/auth/login" -Method POST -ContentType "application/json" -Body (@{
  login = $login
  password = $currentPassword
} | ConvertTo-Json) -TimeoutSec 120

if ($auth.user.role -ne "superadmin") {
  throw "User is not superadmin"
}

Write-Host "Setting new superadmin password..."
Invoke-RestMethod -Uri "$apiBase/api/auth/change-password" -Method POST -ContentType "application/json" -Headers @{
  Authorization = "Bearer $($auth.token)"
} -Body (@{
  currentPassword = $currentPassword
  newPassword = $newPassword
} | ConvertTo-Json) -TimeoutSec 120 | Out-Null

$verify = Invoke-RestMethod -Uri "$apiBase/api/auth/login" -Method POST -ContentType "application/json" -Body (@{
  login = $login
  password = $newPassword
} | ConvertTo-Json) -TimeoutSec 120

if ($verify.user.role -ne "superadmin") {
  throw "Password verification failed"
}

$content = @(
  "# Light CRM platform secrets (do not commit)",
  "SUPER_ADMIN_LOGIN=$login",
  "SUPER_ADMIN_PASSWORD=$newPassword",
  "PROD_API=$apiBase",
  "UPDATED_AT=$(Get-Date -Format o)"
) -join "`n"

Set-Content -Path $SecretsPath -Value $content -Encoding UTF8

Write-Host "Done. Password saved to infra/platform.secrets.env"
Write-Host "Login: $login"
