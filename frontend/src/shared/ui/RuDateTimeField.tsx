import { useState } from "react";
import { formatLocalInputRu, parseRuDateTimeToLocalInput, parseRuDateToKey } from "../lib/dateTime";

type FieldProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  id?: string;
};

function useDraft(value: string, format: (value: string) => string) {
  const [draft, setDraft] = useState<string | null>(null);
  return {
    shown: draft ?? format(value),
    onFocus: () => setDraft(format(value)),
    onBlur: () => setDraft(null),
    setDraft
  };
}

/** Поле даты и времени: на экране дд.мм.гггг, чч:мм, в состоянии — YYYY-MM-DDTHH:mm. */
export function RuDateTimeField(props: FieldProps): JSX.Element {
  const field = useDraft(props.value, (value) => formatLocalInputRu(value, true));

  return (
    <input
      id={props.id}
      className={props.className}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      lang="ru"
      placeholder="дд.мм.гггг, чч:мм"
      aria-label={props.ariaLabel || "Дата и время"}
      value={field.shown}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
      onChange={(event) => {
        const text = event.target.value;
        field.setDraft(text);
        if (!text.trim()) {
          props.onChange("");
          return;
        }
        const parsed = parseRuDateTimeToLocalInput(text);
        if (parsed) {
          props.onChange(parsed);
        }
      }}
    />
  );
}

/** Поле календарной даты: на экране дд.мм.гггг, в состоянии — YYYY-MM-DD. */
export function RuDateField(props: FieldProps): JSX.Element {
  const field = useDraft(props.value, (value) => formatLocalInputRu(value, false));

  return (
    <input
      id={props.id}
      className={props.className}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      lang="ru"
      placeholder="дд.мм.гггг"
      aria-label={props.ariaLabel || "Дата"}
      value={field.shown}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
      onChange={(event) => {
        const text = event.target.value;
        field.setDraft(text);
        if (!text.trim()) {
          props.onChange("");
          return;
        }
        const parsed = parseRuDateToKey(text);
        if (parsed) {
          props.onChange(parsed);
        }
      }}
    />
  );
}
