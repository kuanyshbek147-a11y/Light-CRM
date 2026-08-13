import { AutoReplyConnect } from "./AutoReplyConnect";
import { EmailConnect } from "./EmailConnect";
import { InstagramConnect } from "./InstagramConnect";
import { TelegramConnect } from "./TelegramConnect";
import { WebChatConnect } from "./WebChatConnect";
import { WhatsAppEmbeddedSignup } from "./WhatsAppEmbeddedSignup";
import { TelephonyConnect } from "../telephony/TelephonyConnect";

type Props = {
  authToken: string;
};

export function IntegrationsPanel({ authToken }: Props) {
  return (
    <section className="integrationsPanel card">
      <div className="integrationsPanelHeader">
        <div>
          <h2 className="integrationsPanelTitle">Интеграции</h2>
          <p className="integrationsHint">
            Подключите WhatsApp, Instagram, Telegram, почту, виджет чата и телефонию Asterisk в одном
            рабочем пространстве.
          </p>
        </div>
      </div>
      <AutoReplyConnect authToken={authToken} />
      <WhatsAppEmbeddedSignup authToken={authToken} />
      <InstagramConnect authToken={authToken} />
      <TelegramConnect authToken={authToken} />
      <EmailConnect authToken={authToken} />
      <WebChatConnect authToken={authToken} />
      <TelephonyConnect authToken={authToken} />
    </section>
  );
}
