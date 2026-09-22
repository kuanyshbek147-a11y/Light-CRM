import { useEffect } from "react";
import type { OnboardingStepId, OnboardingSteps } from "./onboardingStorage";

export const FIRST_RUN_MENU_LABEL = "Быстрый старт";

type StepCopy = {
  id: OnboardingStepId;
  title: string;
  body: string;
};

const STEPS: readonly StepCopy[] = [
  {
    id: "channel",
    title: "Подключите канал",
    body: "Подключите WhatsApp или Telegram. Когда канал подключён, новые сообщения клиентов сами появятся в разделе «Диалоги»."
  },
  {
    id: "lead",
    title: "Откройте чат и обработайте первый лид",
    body: "Выберите диалог и ответьте клиенту. Так первое обращение не останется без внимания."
  },
  {
    id: "next",
    title: "Назначьте следующий шаг",
    body: "Поставьте задачу или заведите сделку — чтобы было ясно, что делать с этим клиентом дальше."
  }
];

type Props = {
  mode: "hidden" | "overlay" | "dock";
  step: number;
  stepsDone: OnboardingSteps;
  isAdmin: boolean;
  demoData: boolean;
  onStepChange: (step: number) => void;
  onOpenChannel: () => void;
  onOpenDialogs: () => void;
  onOpenTasks: () => void;
  onOpenPipeline: () => void;
  onSkip: () => void;
  onComplete: () => void;
  onMinimize: () => void;
  onResume: () => void;
};

export function FirstRunGuide(props: Props): JSX.Element | null {
  const { mode, step, stepsDone, isAdmin, demoData, onMinimize } = props;
  const safeStep = Math.min(Math.max(step, 0), STEPS.length - 1);
  const current = STEPS[safeStep];

  useEffect(() => {
    if (mode !== "overlay") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onMinimize();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onMinimize]);

  if (mode === "hidden" || !current) return null;

  if (mode === "dock") {
    const doneCount = STEPS.filter((item) => stepsDone[item.id]).length;
    return (
      <div className="firstRunDock card" role="status" data-testid="first-run-dock">
        <div className="firstRunDockText">
          <strong>{FIRST_RUN_MENU_LABEL}</strong>
          <span>
            {doneCount} из {STEPS.length} · можно вернуться в любой момент
          </span>
        </div>
        <div className="firstRunDockActions">
          <button type="button" className="primaryButton" onClick={props.onResume}>
            Продолжить
          </button>
          <button type="button" className="dialogActionBtn" onClick={props.onSkip}>
            Пропустить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="firstRunOverlay"
      role="presentation"
      data-testid="first-run-guide"
      onClick={onMinimize}
    >
      <div
        className="firstRunCard card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-run-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="firstRunHeader">
          <div>
            <div className="firstRunKicker">Первый вход</div>
            <h2 id="first-run-title" className="firstRunTitle">
              {FIRST_RUN_MENU_LABEL}
            </h2>
            <p className="firstRunLead">
              Три шага: откуда приходят сообщения, как взять первый диалог и что сделать дальше.
            </p>
          </div>
          <button type="button" className="dialogActionBtn firstRunSkip" data-testid="first-run-skip" onClick={props.onSkip}>
            Пропустить
          </button>
        </div>

        {demoData ? (
          <p className="firstRunDemoNote" data-testid="first-run-demo-note">
            Это учебные данные. Диалоги и клиенты на экране — примеры для знакомства с кабинетом, не живые продажи.
          </p>
        ) : null}

        <ol className="firstRunSteps">
          {STEPS.map((item, index) => {
            const active = index === safeStep;
            const done = stepsDone[item.id];
            return (
              <li key={item.id} className={active ? "active" : done ? "done" : ""}>
                <button
                  type="button"
                  className="firstRunStepButton"
                  aria-current={active ? "step" : undefined}
                  data-testid={`first-run-step-${item.id}`}
                  onClick={() => props.onStepChange(index)}
                >
                  <span className="firstRunStepNum" aria-hidden="true">
                    {done ? "✓" : index + 1}
                  </span>
                  <span className="firstRunStepTitle">{item.title}</span>
                </button>
                {active ? (
                  <div className="firstRunStepBody">
                    <p>{item.body}</p>
                    {item.id === "channel" && !isAdmin ? (
                      <p className="firstRunStepHint">
                        Подключить канал может администратор компании. Вам достаточно открывать диалоги и отвечать клиентам.
                      </p>
                    ) : null}
                    <div className="firstRunStepActions">
                      {item.id === "channel" && isAdmin ? (
                        <button type="button" className="primaryButton" onClick={props.onOpenChannel}>
                          Открыть подключение
                        </button>
                      ) : null}
                      {item.id === "lead" ? (
                        <button type="button" className="primaryButton" onClick={props.onOpenDialogs}>
                          Открыть диалоги
                        </button>
                      ) : null}
                      {item.id === "next" ? (
                        <>
                          <button type="button" className="primaryButton" onClick={props.onOpenTasks}>
                            Открыть задачи
                          </button>
                          <button type="button" className="dialogActionBtn" onClick={props.onOpenPipeline}>
                            Открыть воронку
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        <div className="firstRunFooter">
          <span className="firstRunProgress">
            Шаг {safeStep + 1} из {STEPS.length}
          </span>
          <div className="firstRunFooterActions">
            {safeStep > 0 ? (
              <button type="button" className="dialogActionBtn" onClick={() => props.onStepChange(safeStep - 1)}>
                Назад
              </button>
            ) : null}
            {safeStep < STEPS.length - 1 ? (
              <button type="button" className="primaryButton" onClick={() => props.onStepChange(safeStep + 1)}>
                Дальше
              </button>
            ) : (
              <button type="button" className="primaryButton" data-testid="first-run-complete" onClick={props.onComplete}>
                Готово
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
