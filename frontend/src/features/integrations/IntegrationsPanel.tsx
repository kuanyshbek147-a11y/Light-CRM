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
            Подключите официальный WhatsApp Cloud API через Embedded Signup (режим Coexistence).
          </p>
        </div>
      </div>
      <WhatsAppEmbeddedSignup authToken={authToken} />
    </section>
  );
}
