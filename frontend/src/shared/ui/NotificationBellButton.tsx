type Props = {
  enabled: boolean;
  onToggle: () => void;
  className?: string;
  size?: number;
};

function BellIcon({ size }: { size: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5c-2.9 0-5.25 2.2-5.25 4.9v2.35c0 .72-.24 1.42-.68 2L4.7 14.7a1.2 1.2 0 0 0 .95 1.95h12.7a1.2 1.2 0 0 0 .95-1.95l-1.37-1.95a3.4 3.4 0 0 1-.68-2V8.4C17.25 5.7 14.9 3.5 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.6 16.65a2.5 2.5 0 0 0 4.8 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M12 3.5V2.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function BellOffIcon({ size }: { size: number }): JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3.5c-2.9 0-5.25 2.2-5.25 4.9v2.35c0 .72-.24 1.42-.68 2L4.7 14.7a1.2 1.2 0 0 0 .95 1.95h12.7a1.2 1.2 0 0 0 .95-1.95l-1.37-1.95a3.4 3.4 0 0 1-.68-2V8.4C17.25 5.7 14.9 3.5 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        d="M9.6 16.65a2.5 2.5 0 0 0 4.8 0"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M5 5.2 19 18.8"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function NotificationBellButton({ enabled, onToggle, className = "", size = 18 }: Props): JSX.Element {
  return (
    <button
      type="button"
      className={`notifyBellBtn ${enabled ? "isOn" : "isOff"} ${className}`.trim()}
      title={enabled ? "Звук уведомлений: вкл" : "Звук уведомлений: выкл"}
      aria-label={enabled ? "Выключить звук уведомлений" : "Включить звук уведомлений"}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <span className="notifyBellBtnIcon">{enabled ? <BellIcon size={size} /> : <BellOffIcon size={size} />}</span>
      {!enabled ? <span className="notifyBellBtnBadge">выкл</span> : null}
    </button>
  );
}
