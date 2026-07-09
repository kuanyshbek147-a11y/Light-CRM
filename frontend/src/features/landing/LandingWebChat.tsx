import { useEffect } from "react";
import { SOCKET_BASE_URL } from "../../shared/config/api";

/** Must match backend DEMO_LANDING_WIDGET_ID */
export const LANDING_WEBCHAT_WIDGET_ID = "wc_lightcrm_landing_demo";

function resolveWidgetScriptUrl(): string {
  return `${SOCKET_BASE_URL.replace(/\/+$/, "")}/widget.js`;
}

/**
 * Loads the Light CRM webchat bubble on the public landing page (bottom-right).
 */
export function LandingWebChat(): null {
  useEffect(() => {
    const existing = document.getElementById("lightcrm-landing-webchat-script");
    if (existing) {
      return;
    }

    const script = document.createElement("script");
    script.id = "lightcrm-landing-webchat-script";
    script.src = resolveWidgetScriptUrl();
    script.async = true;
    script.setAttribute("data-widget-id", LANDING_WEBCHAT_WIDGET_ID);
    script.setAttribute("data-api-base", SOCKET_BASE_URL.replace(/\/+$/, ""));
    document.body.appendChild(script);

    return () => {
      script.remove();
      document.getElementById("lightcrm-webchat-root")?.remove();
    };
  }, []);

  return null;
}
