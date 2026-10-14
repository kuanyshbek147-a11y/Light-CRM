import { forwardRef, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

function EyeIcon({ crossed }: { crossed: boolean }): JSX.Element {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      {crossed ? <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /> : null}
    </svg>
  );
}

/** Поле пароля с кнопкой-«глазиком», которая показывает и скрывает введённый текст. */
export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className, ...rest },
  ref
) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="passwordInputWrap">
      <input
        {...rest}
        ref={ref}
        type={visible ? "text" : "password"}
        className={`${className ?? ""} passwordInputField`.trim()}
      />
      <button
        type="button"
        className="passwordToggle"
        aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
        aria-pressed={visible}
        title={visible ? "Скрыть пароль" : "Показать пароль"}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((prev) => !prev)}
      >
        <EyeIcon crossed={visible} />
      </button>
    </span>
  );
});
