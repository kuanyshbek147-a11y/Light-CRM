import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { registerAccount } from "./registerAccount";
import {
  REGISTER_COPY,
  validateRegisterForm,
  type RegisterFieldErrors,
  type RegisterSessionUser
} from "./registerValidation";

type RegisterAccountDialogProps = {
  onClose: () => void;
  onOpenDemo: () => void;
  onAuthenticated: (token: string, user: RegisterSessionUser | null) => Promise<void>;
};

export function RegisterAccountDialog({
  onClose,
  onOpenDemo,
  onAuthenticated
}: RegisterAccountDialogProps): JSX.Element {
  const titleId = useId();
  const emailRef = useRef<HTMLInputElement | null>(null);
  const submittingRef = useRef(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [banner, setBanner] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && !submittingRef.current) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (submittingRef.current) {
      return;
    }

    const nextErrors = validateRegisterForm({ email, password, companyName });
    setFieldErrors(nextErrors);
    setBanner("");
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await registerAccount({ email, password, companyName });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors);
        setBanner(result.banner);
        return;
      }
      await onAuthenticated(result.token, result.user);
    } catch {
      setBanner(REGISTER_COPY.failed);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const emailErrorId = fieldErrors.email ? "register-email-error" : undefined;
  const passwordHintId = "register-password-hint";
  const passwordErrorId = fieldErrors.password ? "register-password-error" : undefined;

  return (
    <div
      className="registerOverlay"
      onClick={() => {
        if (!submittingRef.current) {
          onClose();
        }
      }}
    >
      <div
        className="loginCard registerDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="loginCardBody">
          <div className="registerDialogHeader">
            <h2 id={titleId} className="loginTitle">
              Создать аккаунт
            </h2>
            <button type="button" className="textButton" onClick={onClose} disabled={submitting}>
              Закрыть
            </button>
          </div>
          <p className="loginText">Email и пароль. Рабочее пространство откроется сразу, без подтверждения почты.</p>
          {banner ? (
            <p className="registerBanner" role="alert">
              {banner}
            </p>
          ) : null}
          <form className="loginForm" noValidate onSubmit={(event) => void onSubmit(event)}>
            <label className={`loginField${fieldErrors.email ? " loginFieldInvalid" : ""}`}>
              <span className="loginFieldLabel">Email *</span>
              <input
                ref={emailRef}
                className="loginInput loginInputModern"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                aria-invalid={fieldErrors.email ? true : undefined}
                aria-describedby={emailErrorId}
                onChange={(event) => setEmail(event.target.value)}
              />
              {fieldErrors.email ? (
                <span id="register-email-error" className="loginFieldError" role="alert">
                  {fieldErrors.email}
                </span>
              ) : null}
            </label>
            <label className={`loginField${fieldErrors.password ? " loginFieldInvalid" : ""}`}>
              <span className="loginFieldLabel">Пароль *</span>
              <input
                className="loginInput loginInputModern"
                type="password"
                name="password"
                autoComplete="new-password"
                value={password}
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={[passwordHintId, passwordErrorId].filter(Boolean).join(" ")}
                onChange={(event) => setPassword(event.target.value)}
              />
              <span id={passwordHintId} className="loginFieldHint">
                {REGISTER_COPY.passwordHelper}
              </span>
              {fieldErrors.password ? (
                <span id="register-password-error" className="loginFieldError" role="alert">
                  {fieldErrors.password}
                </span>
              ) : null}
            </label>
            <label className={`loginField${fieldErrors.companyName ? " loginFieldInvalid" : ""}`}>
              <span className="loginFieldLabel">Название компании</span>
              <input
                className="loginInput loginInputModern"
                type="text"
                name="organization"
                autoComplete="organization"
                placeholder="Например, ИП Ромашка"
                value={companyName}
                aria-invalid={fieldErrors.companyName ? true : undefined}
                onChange={(event) => setCompanyName(event.target.value)}
              />
              {fieldErrors.companyName ? (
                <span className="loginFieldError" role="alert">
                  {fieldErrors.companyName}
                </span>
              ) : null}
            </label>
            <button className="landingButton landingButtonModern" type="submit" disabled={submitting}>
              {submitting ? "Создаём…" : "Создать аккаунт"}
            </button>
          </form>
          <button type="button" className="textButton registerDemoLink" onClick={onOpenDemo} disabled={submitting}>
            Уже есть аккаунт? Войти
          </button>
        </div>
      </div>
    </div>
  );
}
