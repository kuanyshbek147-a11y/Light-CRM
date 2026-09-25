import { useEffect } from "react";
import { AutoReplyConnect } from "./AutoReplyConnect";
import { EmailConnect } from "./EmailConnect";
import { InstagramConnect } from "./InstagramConnect";
import { TelegramConnect } from "./TelegramConnect";
import { WebChatConnect } from "./WebChatConnect";
import { WhatsAppEmbeddedSignup } from "./WhatsAppEmbeddedSignup";
import { TelephonyConnect } from "../telephony/TelephonyConnect";

type Props = {
  authToken: string;
  focus?: "telegram" | "instagram" | null;
};

export function IntegrationsPanel({ authToken, focus }: Props) {
  useEffect(() => {
    if (!focus) return;
    document.getElementById(`integration-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  const jumpTo = (id: string) =>
    document.getElementById(`integration-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Сначала каналы переписки — ради них сюда приходят; остальное ниже, в «Дополнительно».
  return (
    <section className="integrationsPanel card">
      <div className="integrationsPanelHeader">
        <div>
          <h2 className="integrationsPanelTitle">Интеграции</h2>
          <p className="integrationsHint">
            Подключите мессенджеры — сообщения клиентов начнут приходить в «Диалоги».
          </p>
        </div>
      </div>
      <nav className="integrationsJump" aria-label="Быстрый переход">
        {JUMP_LINKS.map((link) => (
          <button key={link.id} type="button" className="quickChip" onClick={() => jumpTo(link.id)}>
            {link.label}
          </button>
        ))}
      </nav>
      <h3 className="settingsSectionTitle">Каналы переписки</h3>
      <WhatsAppEmbeddedSignup authToken={authToken} />
      <InstagramConnect authToken={authToken} />
      <TelegramConnect authToken={authToken} />
      <h3 className="settingsSectionTitle">Дополнительно</h3>
      <div id="integration-autoreply">
        <AutoReplyConnect authToken={authToken} />
      </div>
      <div id="integration-email">
        <EmailConnect authToken={authToken} />
      </div>
      <div id="integration-webchat">
        <WebChatConnect authToken={authToken} />
      </div>
      <div id="integration-telephony">
        <TelephonyConnect authToken={authToken} />
      </div>
    </section>
  );
}

const JUMP_LINKS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "instagram", label: "Instagram" },
  { id: "telegram", label: "Telegram" },
  { id: "autoreply", label: "Автоответчик" },
  { id: "email", label: "Почта" },
  { id: "webchat", label: "Чат на сайте" },
  { id: "telephony", label: "Телефония" }
] as const;
