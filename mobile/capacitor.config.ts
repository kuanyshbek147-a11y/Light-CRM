import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "kz.lightcrm.app",
  appName: "Light CRM",
  webDir: "www",
  server: {
    // Live CRM shell (same as Android). Offline fallback is www/index.html.
    url: "https://light-crm-kz.netlify.app",
    androidScheme: "https",
    iosScheme: "https"
  },
  android: {
    allowMixedContent: false
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scrollEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#5b5ce9",
      showSpinner: true,
      spinnerColor: "#ffffff"
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#5b5ce9"
    }
  }
};

export default config;
