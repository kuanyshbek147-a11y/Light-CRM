import { useEffect, useState } from "react";

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ may report as Mac
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Safari on iPhone cannot prompt native install — show Share → Add to Home Screen steps.
 */
export function IosHomeScreenHint(): JSX.Element | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIosDevice() || isStandaloneDisplay()) {
      setVisible(false);
      return;
    }
    try {
      if (localStorage.getItem("lightcrm_ios_home_hint_dismissed") === "1") {
        setVisible(false);
        return;
      }
    } catch {
      // ignore
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="iosHomeHint" role="note">
      <div className="iosHomeHintTitle">Установить на iPhone</div>
      <ol className="iosHomeHintSteps">
        <li>
          Откройте сайт в <strong>Safari</strong> (не в Chrome)
        </li>
        <li>
          Нажмите <strong>Поделиться</strong> (□↑)
        </li>
        <li>
          Выберите <strong>«На экран „Домой“»</strong>
        </li>
      </ol>
      <button
        type="button"
        className="iosHomeHintDismiss"
        onClick={() => {
          try {
            localStorage.setItem("lightcrm_ios_home_hint_dismissed", "1");
          } catch {
            // ignore
          }
          setVisible(false);
        }}
      >
        Понятно
      </button>
    </div>
  );
}
