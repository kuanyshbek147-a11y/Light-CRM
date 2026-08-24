# Light CRM — iPhone (iOS)

Нативное оболочечное приложение на **Capacitor 6** (тот же стек, что Android).  
Открывает прод CRM: https://light-crm-kz.netlify.app

- **Bundle ID:** `kz.lightcrm.app`
- **Имя:** Light CRM
- **Проект:** `mobile/ios/App/App.xcworkspace`

## Важно

Сборка IPA / установка на iPhone возможна **только на Mac** (Xcode).  
На Windows можно подготовить проект (`cap add ios` / `ios:prepare`), но не собрать бинарник.

Нужен аккаунт **Apple Developer** ($99/год) для установки на устройство и TestFlight.

## Подготовка (уже сделано в репозитории)

```powershell
cd mobile
npm install
npm run ios:prepare
```

Или из корня:

```powershell
powershell -File infra/scripts/prepare-ios.ps1
```

## Сборка на Mac

1. Установите **Xcode** (App Store) и **CocoaPods** (`sudo gem install cocoapods`).
2. Клонируйте репозиторий, затем:

```bash
cd mobile
npm install
npm run ios:prepare
cd ios/App
pod install
open App.xcworkspace
```

3. В Xcode:
   - Target **App** → **Signing & Capabilities** → выберите **Team**
   - Подключите iPhone → Run ▶  
   - Или **Product → Archive** → Distribute App → TestFlight / App Store

## Права

В `Info.plist` уже есть описания для камеры, микрофона и фото (чат / вложения).
