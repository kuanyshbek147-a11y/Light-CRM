import { useEffect, useState } from "react";
import {
  loadInstagramStatus,
  loadTelegramStatus,
  loadWhatsAppConnectStatus
} from "../integrations/api";

type Props = {
  authToken: string;
  visible: boolean;
  isAdmin: boolean;
  onOpenIntegrations: () => void;
};

type ChannelState = {
  whatsapp: boolean | null;
  telegram: boolean | null;
  instagram: boolean | null;
};

/**
 * Empty-inbox activation checklist for admins (and soft hint for operators).
 */
export function InboxConnectChecklist(props: Props): JSX.Element | null {
  const { authToken, visible, isAdmin, onOpenIntegrations } = props;
  const [channels, setChannels] = useState<ChannelState>({
    whatsapp: null,
    telegram: null,
    instagram: null
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem("lightcrm_inbox_onboard_dismissed") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  useEffect(() => {
    if (!visible || dismissed || !authToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const [wa, tg, ig] = await Promise.all([
          loadWhatsAppConnectStatus(authToken).catch(() => null),
          loadTelegramStatus(authToken).catch(() => null),
          loadInstagramStatus(authToken).catch(() => null)
        ]);
        if (cancelled) return;
        setChannels({
          whatsapp: Boolean(wa?.connected),
          telegram: Boolean(tg?.connected),
          instagram: Boolean(ig?.connected)
        });
      } catch {
        if (!cancelled) {
          setChannels({ whatsapp: false, telegram: false, instagram: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authToken, visible, dismissed]);

  if (!visible || dismissed) return null;

  const items = [
    { key: "whatsapp", label: "WhatsApp", ok: channels.whatsapp },
    { key: "telegram", label: "Telegram", ok: channels.telegram },
    { key: "instagram", label: "Instagram", ok: channels.instagram }
  ] as const;

  const allKnown = items.every((item) => item.ok !== null);
  const allConnected = allKnown && items.every((item) => item.ok);
  if (allConnected) return null;

  return (
    <div className="inboxOnboard card">
      <div className="inboxOnboardTitle">Подключите каналы</div>
      <p className="inboxOnboardText">
        {isAdmin
          ? "Пока нет диалогов. Подключите мессенджеры — новые обращения появятся здесь."
          : "Диалогов пока нет. Попросите администратора подключить WhatsApp, Telegram или Instagram."}
      </p>
      <ul className="inboxOnboardList">
        {items.map((item) => (
          <li key={item.key} className={item.ok ? "ok" : ""}>
            <span className="inboxOnboardCheck" aria-hidden="true">
              {item.ok ? "✓" : "○"}
            </span>
            {item.label}
            <span className="inboxOnboardStatus">
              {item.ok === null ? "…" : item.ok ? "подключён" : "не подключён"}
            </span>
          </li>
        ))}
      </ul>
      <div className="inboxOnboardActions">
        {isAdmin ? (
          <button type="button" className="primaryButton" onClick={onOpenIntegrations}>
            Открыть интеграции
          </button>
        ) : null}
        <button
          type="button"
          className="dialogActionBtn"
          onClick={() => {
            try {
              localStorage.setItem("lightcrm_inbox_onboard_dismissed", "1");
            } catch {
              // ignore
            }
            setDismissed(true);
          }}
        >
          Скрыть
        </button>
      </div>
    </div>
  );
}
