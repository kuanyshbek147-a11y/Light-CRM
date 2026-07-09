import { InstagramConnect } from "./InstagramConnect";
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
            Подключите WhatsApp Cloud API и Instagram Direct в одном рабочем пространстве.
          </p>
        </div>
      </div>
      <WhatsAppEmbeddedSignup authToken={authToken} />
      <InstagramConnect authToken={authToken} />
    </section>
  );
}
