import { useEffect } from "react";
import { AutoReplyConnect } from "./AutoReplyConnect";
import { EmailConnect } from "./EmailConnect";
import { InstagramConnect } from "./InstagramConnect";
import { TelegramConnect } from "./TelegramConnect";
import { WebChatConnect } from "./WebChatConnect";
import { WhatsAppEmbeddedSignup } from "./WhatsAppEmbeddedSignup";
import { TelephonyConnect } from "../telephony/TelephonyConnect";

export type IntegrationsFocus = "whatsapp" | "telegram" | "instagram" | "email" | "web";

type Props = {
  authToken: string;
  focus?: IntegrationsFocus | null;
};

export function IntegrationsPanel({ authToken, focus }: Props) {
  useEffect(() => {
    if (!focus) return;
    document.getElementById(`integration-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus]);

  return (
    <section className="integrationsPanel card">
      <div className="integrationsPanelHeader">
        <div>
          <h2 className="integrationsPanelTitle">Интеграции</h2>
          <p className="integrationsHint">
            Подключите WhatsApp, Instagram, Telegram, почту, виджет чата и телефон в браузере в одном
            рабочем пространстве.
          </p>
        </div>
      </div>
      <WhatsAppEmbeddedSignup authToken={authToken} />
      <InstagramConnect authToken={authToken} />
      <TelegramConnect authToken={authToken} />
      <AutoReplyConnect authToken={authToken} />
      <EmailConnect authToken={authToken} />
      <WebChatConnect authToken={authToken} />
      <TelephonyConnect authToken={authToken} />
    </section>
  );
}
