$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$InfoPath = Join-Path $Root "ios\App\App\Info.plist"
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false

if (-not (Test-Path $InfoPath)) {
  Write-Host "Info.plist not found, skip iOS permissions patch"
  exit 0
}

$plist = [System.IO.File]::ReadAllText($InfoPath).TrimStart([char]0xFEFF)
if ($plist -match "NSCameraUsageDescription") {
  Write-Host "iOS privacy permissions already applied"
  exit 0
}

$block = @"
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
	<key>NSCameraUsageDescription</key>
	<string>Light CRM использует камеру для вложений в чатах и профиле.</string>
	<key>NSMicrophoneUsageDescription</key>
	<string>Light CRM использует микрофон для голосовых сообщений.</string>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>Light CRM использует фото из галереи для вложений.</string>
	<key>NSPhotoLibraryAddUsageDescription</key>
	<string>Light CRM сохраняет изображения только по вашему действию.</string>
"@

if ($plist -notmatch "<key>UILaunchStoryboardName</key>") {
  throw "Unexpected Info.plist structure"
}

$plist = $plist -replace "(<key>UILaunchStoryboardName</key>)", "$block`t`$1"
[System.IO.File]::WriteAllText($InfoPath, $plist, $Utf8NoBom)
Write-Host "iOS privacy permissions applied to Info.plist"
