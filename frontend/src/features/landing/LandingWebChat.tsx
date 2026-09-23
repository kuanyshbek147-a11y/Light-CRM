import { useEffect } from "react";
import { SOCKET_BASE_URL } from "../../shared/config/api";

/** Must match backend DEMO_LANDING_WIDGET_ID */
export const LANDING_WEBCHAT_WIDGET_ID = "wc_lightcrm_landing_demo";

const LOGIN_CTA_SELECTOR = ".loginCardModern .landingButtonModern, .loginCardModern .demoQuickRow";

function resolveWidgetScriptUrl(): string {
  return `${SOCKET_BASE_URL.replace(/\/+$/, "")}/widget.js`;
}

function rectsOverlap(a: DOMRect, b: DOMRect, pad = 8): boolean {
  return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
}

function widgetObstacle(host: HTMLElement): HTMLElement | null {
  const root = host.shadowRoot;
  if (!root) {
    return null;
  }
  return (root.querySelector(".panel.open") || root.querySelector(".bubble")) as HTMLElement | null;
}

/**
 * Hides the landing chat bubble while it would cover «Войти» or operator quick-login.
 * The widget is position:fixed inside an open shadow root, so clearance is applied there.
 */
function applyLandingChatClearance(): void {
  const host = document.getElementById("lightcrm-webchat-root");
  const obstacle = host ? widgetObstacle(host) : null;
  const wrap = host?.shadowRoot?.querySelector(".wrap") as HTMLElement | null;
  if (!host || !obstacle || !wrap) {
    return;
  }

  const obstacleRect = obstacle.getBoundingClientRect();
  const covered = Array.from(document.querySelectorAll(LOGIN_CTA_SELECTOR)).some((node) =>
    rectsOverlap(obstacleRect, node.getBoundingClientRect())
  );

  wrap.style.visibility = covered ? "hidden" : "";
  wrap.style.pointerEvents = covered ? "none" : "";
  host.toggleAttribute("data-landing-chat-clear", covered);
  host.setAttribute("aria-hidden", covered ? "true" : "false");
}

function watchLandingChatClearance(): () => void {
  let frame = 0;
  const schedule = (): void => {
    if (frame) {
      return;
    }
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      applyLandingChatClearance();
    });
  };

  const onHostClick = (): void => schedule();
  const bindHost = (): void => {
    const host = document.getElementById("lightcrm-webchat-root");
    if (!host || host.dataset.landingClearanceBound === "1") {
      return;
    }
    host.dataset.landingClearanceBound = "1";
    host.addEventListener("click", onHostClick);
  };

  const observer = new MutationObserver(() => {
    bindHost();
    schedule();
  });
  observer.observe(document.body, { childList: true });
  window.addEventListener("scroll", schedule, { passive: true, capture: true });
  window.addEventListener("resize", schedule);
  bindHost();
  schedule();

  return () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
    }
    observer.disconnect();
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    document.getElementById("lightcrm-webchat-root")?.removeEventListener("click", onHostClick);
  };
}

/**
 * Loads the Light CRM webchat bubble on the public landing page (bottom-right).
 * On narrow screens the bubble hides while it overlaps the login CTAs.
 */
export function LandingWebChat(): null {
  useEffect(() => {
    const stopClearance = watchLandingChatClearance();
    const existing = document.getElementById("lightcrm-landing-webchat-script");
    if (existing) {
      return () => {
        stopClearance();
      };
    }

    const script = document.createElement("script");
    script.id = "lightcrm-landing-webchat-script";
    script.src = resolveWidgetScriptUrl();
    script.async = true;
    script.setAttribute("data-widget-id", LANDING_WEBCHAT_WIDGET_ID);
    script.setAttribute("data-api-base", SOCKET_BASE_URL.replace(/\/+$/, ""));
    document.body.appendChild(script);

    return () => {
      stopClearance();
      script.remove();
      document.getElementById("lightcrm-webchat-root")?.remove();
    };
  }, []);

  return null;
}
