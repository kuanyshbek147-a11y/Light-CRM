import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { GuideArticlePage } from "./features/guides/GuideArticlePage";
import { isPublicGuidePath } from "./features/guides/guideArticle";
import { ensureRussianDocumentLang } from "./shared/i18n/locale";
import { startBackendKeepAlive } from "./shared/lib/backendWarmup";
import "./styles.css";
import "./mobile-crm-ui.css";

ensureRussianDocumentLang();
startBackendKeepAlive();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

try {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const standalone =
    Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches;
  if (standalone) {
    document.documentElement.classList.add("pwa-standalone");
    document.body.classList.add("pwa-standalone");
  }
} catch {
  // ignore
}

const publicGuide = isPublicGuidePath(window.location.pathname);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {publicGuide ? <GuideArticlePage /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>
);
