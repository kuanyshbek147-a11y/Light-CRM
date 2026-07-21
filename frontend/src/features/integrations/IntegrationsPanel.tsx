import { EmailConnect } from "./EmailConnect";
import { InstagramConnect } from "./InstagramConnect";
import { TelegramConnect } from "./TelegramConnect";
import { WebChatConnect } from "./WebChatConnect";
import { WhatsAppEmbeddedSignup } from "./WhatsAppEmbeddedSignup";

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
            Подключите WhatsApp, Instagram, Telegram, почту и виджет чата на сайте в одном рабочем
            пространстве.
          </p>
        </div>
      </div>
      <WhatsAppEmbeddedSignup authToken={authToken} />
      <InstagramConnect authToken={authToken} />
      <TelegramConnect authToken={authToken} />
      <EmailConnect authToken={authToken} />
      <WebChatConnect authToken={authToken} />
    </section>
  );
}
