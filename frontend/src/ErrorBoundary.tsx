import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Light CRM render error:", error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="centered">
          <div className="integrationsCard" style={{ maxWidth: 480 }}>
            <div className="integrationsTitle">Ошибка загрузки</div>
            <div className="integrationsError">{this.state.error.message}</div>
            <button
              type="button"
              className="primaryButton"
              onClick={() => {
                localStorage.removeItem("lightcrm.token");
                localStorage.removeItem("lightcrm.user");
                window.location.reload();
              }}
            >
              Сбросить сессию и обновить
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
