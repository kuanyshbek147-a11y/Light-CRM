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

const BUBBLE_SIZE = 58;
const BUBBLE_INSET = 20;

function widgetObstacleRect(host: HTMLElement): DOMRect {
  const panelOpen = host.shadowRoot?.querySelector(".panel.open");
  if (panelOpen) {
    const width = Math.min(360, window.innerWidth - 24);
    const height = Math.min(480, window.innerHeight - 110);
    const right = window.innerWidth - BUBBLE_INSET;
    const bottom = window.innerHeight - BUBBLE_INSET - 72;
    return new DOMRect(right - width, bottom - height, width, height);
  }
  return new DOMRect(
    window.innerWidth - BUBBLE_INSET - BUBBLE_SIZE,
    window.innerHeight - BUBBLE_INSET - BUBBLE_SIZE,
    BUBBLE_SIZE,
    BUBBLE_SIZE
  );
}

/**
 * Hides the landing chat bubble while it would cover «Войти» or operator quick-login.
 * The widget is position:fixed inside an open shadow root, so clearance is applied there.
 * The bubble stays out of the document while it overlaps those controls, so it cannot take the click.
 */
function loginCtasCovered(host: HTMLElement): boolean {
  const obstacle = widgetObstacleRect(host);
  return Array.from(document.querySelectorAll(LOGIN_CTA_SELECTOR)).some((node) =>
    rectsOverlap(obstacle, node.getBoundingClientRect())
  );
}

function watchLandingChatClearance(): () => void {
  let frame = 0;
  let hostRef: HTMLElement | null = null;
  let parkedByUs = false;

  const apply = (): void => {
    const found = document.getElementById("lightcrm-webchat-root");
    if (found) {
      hostRef = found;
    }
    const host = hostRef;
    if (!host) {
      return;
    }

    const covered = loginCtasCovered(host);
    host.toggleAttribute("data-landing-chat-clear", covered);
    host.setAttribute("aria-hidden", covered ? "true" : "false");
    if (covered) {
      if (host.isConnected) {
        parkedByUs = true;
        host.remove();
      }
      return;
    }
    if (parkedByUs && !host.isConnected) {
      parkedByUs = false;
      document.body.appendChild(host);
    }
  };

  const schedule = (): void => {
    if (frame) {
      return;
    }
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      apply();
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
    hostRef?.removeEventListener("click", onHostClick);
    hostRef?.remove();
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
