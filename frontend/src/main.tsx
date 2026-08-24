import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import "./styles.css";
import "./mobile-crm-ui.css";

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

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
