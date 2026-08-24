$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Mobile = Join-Path $Root "mobile"

Set-Location $Mobile
if (-not (Test-Path "node_modules")) {
  npm install
}

if (-not (Test-Path (Join-Path $Mobile "ios"))) {
  npx cap add ios
}

& (Join-Path $Mobile "scripts\apply-ios-permissions.ps1")
npm run cap:sync:ios
if ($LASTEXITCODE -ne 0) {
  throw "cap sync ios failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "iOS project ready:"
Write-Host "  $Mobile\ios\App\App.xcworkspace"
Write-Host ""
Write-Host "Next (on a Mac with Xcode + CocoaPods):"
Write-Host "  1. cd mobile/ios/App"
Write-Host "  2. pod install"
Write-Host "  3. open App.xcworkspace"
Write-Host "  4. Select a Team (Apple Developer) → Run on iPhone / Archive for TestFlight"
