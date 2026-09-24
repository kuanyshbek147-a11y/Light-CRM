import { useEffect, useState } from "react";
import { ADMIN_CHANNEL_REQUEST_TEXT, type OnboardingStepId, type OnboardingSteps } from "./onboardingStorage";
import { copyText } from "./copyText";

export const FIRST_RUN_MENU_LABEL = "Быстрый старт";

type StepCopy = {
  id: OnboardingStepId;
  title: string;
  body: string;
};

function guideSteps(isAdmin: boolean, channelDone: boolean): readonly StepCopy[] {
  return [
    {
      id: "channel",
      title: isAdmin ? "Подключите канал" : "Попросите администратора подключить канал",
      body: channelDone
        ? "Канал уже подключён. Живые сообщения приходят в «Диалоги»."
        : isAdmin
          ? "WhatsApp, Instagram или Telegram. Галочка появится, когда канал подключён в этом кабинете."
          : "Отправьте администратору просьбу. Галочка появится, когда канал подключат."
    },
    {
      id: "lead",
      title: "Ответьте в диалоге",
      body: "Выберите диалог и отправьте ответ. Галочка появится после отправки."
    },
    {
      id: "next",
      title: "Назначьте следующий шаг",
      body: "Сохраните задачу или сделку. Пока ничего не сохранено, шаг ждёт этого действия."
    }
  ];
}

type Props = {
  mode: "hidden" | "overlay" | "dock";
  step: number;
  stepsDone: OnboardingSteps;
  isAdmin: boolean;
  demoData: boolean;
  onStepChange: (step: number) => void;
  onOpenChannel: () => void;
  onChannelRequestCopied: () => void;
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
  const steps = guideSteps(isAdmin, stepsDone.channel);
  const safeStep = Math.min(Math.max(step, 0), steps.length - 1);
  const current = steps[safeStep];
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    setCopyState("idle");
  }, [safeStep]);

  useEffect(() => {
    if (mode !== "overlay") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onMinimize();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, onMinimize]);

  async function copyAdminRequest(): Promise<void> {
    const copied = await copyText(ADMIN_CHANNEL_REQUEST_TEXT);
    setCopyState(copied ? "copied" : "failed");
    if (copied) props.onChannelRequestCopied();
  }

  if (mode === "hidden" || !current) return null;

  if (mode === "dock") {
    const doneCount = steps.filter((item) => stepsDone[item.id]).length;
    return (
      <div className="firstRunDock card" role="status" data-testid="first-run-dock">
        <div className="firstRunDockText">
          <strong>{FIRST_RUN_MENU_LABEL}</strong>
          <span>
            {doneCount} из {steps.length} · можно вернуться в любой момент
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
            <p className="firstRunLead">Канал, первый ответ и следующий шаг.</p>
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

        <div className="firstRunBodyScroll">
        <ol className="firstRunSteps">
          {steps.map((item, index) => {
            const active = index === safeStep;
            const done = stepsDone[item.id];
            return (
              <li key={item.id} className={active ? "active" : done ? "done" : "todo"}>
                <button
                  type="button"
                  className="firstRunStepButton"
                  aria-current={active ? "step" : undefined}
                  aria-label={`${item.title}, ${done ? "сделано" : "не сделано"}`}
                  data-testid={`first-run-step-${item.id}`}
                  data-step-state={done ? "done" : "todo"}
                  onClick={() => props.onStepChange(index)}
                >
                  <span className="firstRunStepNum" aria-hidden="true">
                    {done ? "✓" : index + 1}
                  </span>
                  <span className="firstRunStepTitle">{item.title}</span>
                  {!done && !active ? <span className="firstRunStepTodo">не сделано</span> : null}
                </button>
                {active ? (
                  <div className="firstRunStepBody">
                    <p>{item.body}</p>
                    {item.id === "channel" && !isAdmin && !stepsDone.channel ? (
                      <>
                        {demoData ? (
                          <p className="firstRunStepHint" data-testid="first-run-training-note">
                            Пока канал не подключён, диалоги на экране — учебные данные. Живые сообщения появятся, когда администратор подключит WhatsApp, Instagram или Telegram.
                          </p>
                        ) : (
                          <p className="firstRunStepHint" data-testid="first-run-training-note">
                            Скопируйте просьбу и отправьте администратору. Галочка появится, когда WhatsApp, Instagram или Telegram будет подключён.
                          </p>
                        )}
                        <details className="firstRunRequestDetails">
                          <summary>Текст просьбы</summary>
                          <p className="firstRunRequestPreview" data-testid="first-run-admin-request">
                            {ADMIN_CHANNEL_REQUEST_TEXT}
                          </p>
                        </details>
                        <div className="firstRunStepActions">
                          <button
                            type="button"
                            className="primaryButton firstRunCopyButton"
                            data-testid="first-run-copy-admin-request"
                            onClick={() => void copyAdminRequest()}
                          >
                            Скопировать просьбу администратору
                          </button>
                        </div>
                        {copyState === "copied" ? (
                          <p className="firstRunCopyStatus" data-testid="first-run-copy-status">
                            Текст скопирован. Отправьте его администратору.
                          </p>
                        ) : null}
                        {copyState === "failed" ? (
                          <p className="firstRunCopyStatus failed" data-testid="first-run-copy-status">
                            Не удалось скопировать. Откройте «Текст просьбы» и скопируйте вручную.
                          </p>
                        ) : null}
                      </>
                    ) : null}
                    {item.id !== "channel" || isAdmin ? (
                    <div className="firstRunStepActions">
                      {item.id === "channel" && isAdmin ? (
                        <button type="button" className="primaryButton" data-testid="first-run-open-integrations" onClick={props.onOpenChannel}>
                          Подключить канал
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
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
        </div>

        <div className="firstRunFooter">
          <span className="firstRunProgress">
            Шаг {safeStep + 1} из {steps.length}
          </span>
          <div className="firstRunFooterActions">
            {safeStep > 0 ? (
              <button type="button" className="dialogActionBtn" onClick={() => props.onStepChange(safeStep - 1)}>
                Назад
              </button>
            ) : null}
            {safeStep < steps.length - 1 ? (
              <button type="button" className="dialogActionBtn" onClick={() => props.onStepChange(safeStep + 1)}>
                Дальше
              </button>
            ) : (
              <button type="button" className="dialogActionBtn" data-testid="first-run-complete" onClick={props.onComplete}>
                Готово
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
