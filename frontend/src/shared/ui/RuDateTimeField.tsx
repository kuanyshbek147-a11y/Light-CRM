import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  RU_DATETIME_ERROR,
  classifyRuDateTime,
  formatLocalInputRu,
  maskRuDateInput,
  maskRuDateTimeInput
} from "../lib/dateTime";

type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  onInvalidChange?: (invalid: boolean) => void;
  className?: string;
  ariaLabel?: string;
  id?: string;
};

type MaskResult = { text: string; caret: number };

function DateFieldShell(props: {
  id?: string;
  className?: string;
  ariaLabel: string;
  placeholder: string;
  shown: string;
  error: string;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (raw: string, caret: number) => void;
  inputRef: RefObject<HTMLInputElement>;
}): JSX.Element {
  const errorId = props.error ? `${props.id || props.ariaLabel}-error` : undefined;
  return (
    <span className="ruDateField">
      <input
        ref={props.inputRef}
        id={props.id}
        className={props.className}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        lang="ru"
        placeholder={props.placeholder}
        aria-label={props.ariaLabel}
        aria-invalid={Boolean(props.error)}
        aria-describedby={errorId}
        value={props.shown}
        onFocus={props.onFocus}
        onBlur={props.onBlur}
        onChange={(event) => {
          props.onChange(event.target.value, event.target.selectionStart ?? event.target.value.length);
        }}
      />
      {props.error ? (
        <span className="ruDateFieldError" id={errorId} role="alert">
          {props.error}
        </span>
      ) : null}
    </span>
  );
}

function useMaskedDateField(
  value: string,
  withTime: boolean,
  onChange: (value: string) => void,
  onInvalidChange?: (invalid: boolean) => void
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previousRef = useRef("");
  const caretRef = useRef<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const shown = draft ?? formatLocalInputRu(value, withTime);

  useLayoutEffect(() => {
    if (caretRef.current === null || !inputRef.current) {
      return;
    }
    const pos = caretRef.current;
    inputRef.current.setSelectionRange(pos, pos);
    caretRef.current = null;
  }, [draft]);

  function reportInvalid(invalid: boolean): void {
    onInvalidChange?.(invalid);
  }

  function applyMasked(raw: string, caret: number): MaskResult {
    const masked = withTime
      ? maskRuDateTimeInput(raw, previousRef.current, caret)
      : maskRuDateInput(raw, previousRef.current, caret);
    previousRef.current = masked.text;
    caretRef.current = masked.caret;
    setDraft(masked.text);
    return masked;
  }

  return {
    inputRef,
    shown,
    error,
    onFocus: () => {
      const formatted = formatLocalInputRu(value, withTime);
      previousRef.current = formatted;
      setDraft(formatted);
    },
    onBlur: () => {
      const text = (draft ?? formatLocalInputRu(value, withTime)).trim();
      if (!text) {
        setError("");
        reportInvalid(false);
        onChange("");
        setDraft(null);
        return;
      }
      const parsed = classifyRuDateTime(text);
      if (parsed.ok === "valid") {
        const next = withTime ? parsed.value : parsed.value.slice(0, 10);
        setError("");
        reportInvalid(false);
        onChange(next);
        setDraft(null);
        return;
      }
      setError(RU_DATETIME_ERROR);
      reportInvalid(true);
    },
    onChange: (raw: string, caret: number) => {
      const masked = applyMasked(raw, caret);
      if (!masked.text.trim()) {
        setError("");
        reportInvalid(false);
        onChange("");
        return;
      }
      const parsed = classifyRuDateTime(masked.text);
      if (parsed.ok === "valid" && !parsed.provisional) {
        setError("");
        reportInvalid(false);
        onChange(withTime ? parsed.value : parsed.value.slice(0, 10));
        return;
      }
      if (parsed.ok === "invalid") {
        setError(RU_DATETIME_ERROR);
        reportInvalid(true);
        return;
      }
      setError("");
      reportInvalid(true);
    }
  };
}

/** Поле даты и времени: на экране дд.мм.гггг, чч:мм, в состоянии — YYYY-MM-DDTHH:mm. */
export function RuDateTimeField(props: FieldProps): JSX.Element {
  const field = useMaskedDateField(props.value, true, props.onChange, props.onInvalidChange);
  return (
    <DateFieldShell
      id={props.id}
      className={props.className}
      ariaLabel={props.ariaLabel || "Дата и время"}
      placeholder="дд.мм.гггг, чч:мм"
      shown={field.shown}
      error={field.error}
      inputRef={field.inputRef}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
      onChange={field.onChange}
    />
  );
}

/** Поле календарной даты: на экране дд.мм.гггг, в состоянии — YYYY-MM-DD. */
export function RuDateField(props: FieldProps): JSX.Element {
  const field = useMaskedDateField(props.value, false, props.onChange, props.onInvalidChange);
  return (
    <DateFieldShell
      id={props.id}
      className={props.className}
      ariaLabel={props.ariaLabel || "Дата"}
      placeholder="дд.мм.гггг"
      shown={field.shown}
      error={field.error}
      inputRef={field.inputRef}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
      onChange={field.onChange}
    />
  );
}
