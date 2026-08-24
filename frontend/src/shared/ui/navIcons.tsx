import type { ReactNode } from "react";

type SvgProps = { className?: string; children: ReactNode; label: string };

function Svg({ className, children, label }: SvgProps): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <title>{label}</title>
      {children}
    </svg>
  );
}

export function NavIconDialogs(props: { className?: string }): JSX.Element {
  return (
    <Svg className={props.className} label="Диалоги">
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H10l-4 3.5V16H6.5A2.5 2.5 0 0 1 4 13.5z" />
    </Svg>
  );
}

export function NavIconFunnel(props: { className?: string }): JSX.Element {
  return (
    <Svg className={props.className} label="Воронка">
      <path d="M4 5h16l-5.5 7.2V19l-5 2v-8.8z" />
    </Svg>
  );
}

export function NavIconTasks(props: { className?: string }): JSX.Element {
  return (
    <Svg className={props.className} label="Задачи">
      <path d="M8 5h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
      <path d="M9 10h8M9 14h6" />
      <path d="M5 8l1.5 1.5L9 7" />
    </Svg>
  );
}

export function NavIconProfile(props: { className?: string }): JSX.Element {
  return (
    <Svg className={props.className} label="Профиль">
      <circle cx="12" cy="9" r="3.2" />
      <path d="M5.5 19c1.6-3 4-4.5 6.5-4.5S17 16 18.5 19" />
    </Svg>
  );
}
