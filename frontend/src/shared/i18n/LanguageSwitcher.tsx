import { useState } from "react";
import { LOCALE_STUB_NOTE, readLocale, writeLocale, type AppLocale } from "./locale";

const OPTIONS: Array<{ id: AppLocale; label: string; title: string }> = [
  { id: "ru", label: "RU", title: "Русский" },
  { id: "kk", label: "KK", title: "Казахский — скоро, пока интерфейс на русском" },
  { id: "en", label: "EN", title: "Английский — скоро, пока интерфейс на русском" }
];

type LanguageSwitcherProps = {
  showNote?: boolean;
};

export function LanguageSwitcher(props: LanguageSwitcherProps): JSX.Element {
  const [locale, setLocale] = useState<AppLocale>(() => readLocale());

  return (
    <div className="localeSwitch">
      <div className="localeSwitchGroup" role="group" aria-label="Язык интерфейса">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={`localeSwitchBtn${locale === option.id ? " active" : ""}`}
            aria-pressed={locale === option.id}
            title={option.title}
            onClick={() => {
              writeLocale(option.id);
              setLocale(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      {props.showNote && locale !== "ru" ? <p className="localeSwitchNote">{LOCALE_STUB_NOTE}</p> : null}
    </div>
  );
}
