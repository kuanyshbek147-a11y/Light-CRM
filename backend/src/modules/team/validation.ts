export type TeamRole = "admin" | "manager";

export type NewTeamUser = {
  fullName: string;
  login: string;
  email: string;
  password: string;
  role: TeamRole;
};

export const TEAM_PASSWORD_MIN = 8;

const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Проверяет форму «Добавить сотрудника». Почта необязательна: у менеджера её может не быть,
 * тогда подставляем служебный адрес по логину (логины уникальны на всю платформу).
 */
export function validateNewTeamUser(
  body: Record<string, unknown>
): { ok: true; value: NewTeamUser } | { ok: false; error: string } {
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const login = typeof body.login === "string" ? body.login.trim().toLowerCase() : "";
  const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role: TeamRole = body.role === "admin" ? "admin" : "manager";

  if (!fullName) {
    return { ok: false, error: "Укажите имя сотрудника" };
  }
  if (!LOGIN_RE.test(login)) {
    return { ok: false, error: "Логин — от 3 до 32 символов: латинские буквы, цифры, точка, дефис" };
  }
  if (rawEmail && !EMAIL_RE.test(rawEmail)) {
    return { ok: false, error: "Похоже, почта написана с ошибкой" };
  }
  if (password.length < TEAM_PASSWORD_MIN) {
    return { ok: false, error: `Пароль — минимум ${TEAM_PASSWORD_MIN} символов` };
  }

  return {
    ok: true,
    value: { fullName, login, email: rawEmail || `${login}@staff.lightcrm.local`, password, role }
  };
}
