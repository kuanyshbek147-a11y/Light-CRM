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
 * Пустой inbox: следующий шаг — подключить канал или дождаться сообщений.
 * Состояние не скрывается в пустую строку «диалогов нет».
 */
export function InboxConnectChecklist(props: Props): JSX.Element | null {
  const { authToken, visible, isAdmin, onOpenIntegrations } = props;
  const [channels, setChannels] = useState<ChannelState>({
    whatsapp: null,
    telegram: null,
    instagram: null
  });

  useEffect(() => {
    if (!visible || !authToken) return;
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
  }, [authToken, visible]);

  if (!visible) return null;

  const items = [
    { key: "whatsapp", label: "WhatsApp", ok: channels.whatsapp },
    { key: "telegram", label: "Telegram", ok: channels.telegram },
    { key: "instagram", label: "Instagram", ok: channels.instagram }
  ] as const;

  const allKnown = items.every((item) => item.ok !== null);
  const allConnected = allKnown && items.every((item) => item.ok);
  const title = !allKnown ? "Диалогов пока нет" : allConnected ? "Ждём сообщения" : "Подключите канал";
  const text = !allKnown
    ? "Проверяем WhatsApp, Telegram и Instagram. Если канал ещё не подключён, откройте интеграции."
    : allConnected
      ? "Каналы подключены. Новые диалоги появятся здесь, как только клиент напишет."
      : isAdmin
        ? "Пока нет диалогов. Подключите мессенджер — обращения появятся в этом списке."
        : "Диалогов пока нет. Попросите администратора подключить WhatsApp, Telegram или Instagram.";

  return (
    <div className="inboxOnboard card" data-testid="inbox-empty-state">
      <div className="inboxOnboardTitle">{title}</div>
      <p className="inboxOnboardText">{text}</p>
      {!allConnected ? (
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
      ) : null}
      <div className="inboxOnboardActions">
        {isAdmin ? (
          <button type="button" className="primaryButton" data-testid="inbox-open-integrations" onClick={onOpenIntegrations}>
            {allConnected ? "Проверить интеграции" : "Открыть интеграции"}
          </button>
        ) : (
          <button type="button" className="secondaryButton" disabled title="Доступно администратору">
            Открыть интеграции
          </button>
        )}
      </div>
      {!isAdmin && !allConnected ? (
        <p className="sidebarHint">Следующий шаг: администратор открывает «Интеграции» и подключает канал.</p>
      ) : null}
    </div>
  );
}
