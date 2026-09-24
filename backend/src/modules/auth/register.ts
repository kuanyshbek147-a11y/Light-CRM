export const REGISTER_MIN_PASSWORD_LENGTH = 8;

export const REGISTER_COPY = {
  emailRequired: "Укажите email",
  emailInvalid: "Похоже, email написан с ошибкой",
  passwordRequired: "Придумайте пароль",
  passwordShort: "Пароль слишком короткий — нужно минимум 8 символов",
  passwordLong: "Пароль слишком длинный",
  companyLong: "Название компании слишком длинное",
  emailTaken: "Этот email уже зарегистрирован. Войдите или укажите другой.",
  failed: "Не удалось создать аккаунт. Попробуйте ещё раз."
} as const;

export type RegisterField = "email" | "password" | "companyName";

export type RegisterInput = {
  email: string;
  password: string;
  companyName: string;
  workspaceName: string;
  fullName: string;
  login: string;
};

export type RegisterValidation =
  | { ok: true; value: RegisterInput }
  | { ok: false; field: RegisterField; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegisterBody(body: unknown): RegisterValidation {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
  const password = typeof record.password === "string" ? record.password : "";
  const companyName = typeof record.companyName === "string" ? record.companyName.trim() : "";

  if (!email) {
    return { ok: false, field: "email", error: REGISTER_COPY.emailRequired };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, field: "email", error: REGISTER_COPY.emailInvalid };
  }
  if (!password) {
    return { ok: false, field: "password", error: REGISTER_COPY.passwordRequired };
  }
  if (password.length < REGISTER_MIN_PASSWORD_LENGTH) {
    return { ok: false, field: "password", error: REGISTER_COPY.passwordShort };
  }
  if (password.length > 128) {
    return { ok: false, field: "password", error: REGISTER_COPY.passwordLong };
  }
  if (companyName.length > 120) {
    return { ok: false, field: "companyName", error: REGISTER_COPY.companyLong };
  }

  const local = email.split("@")[0] || "owner";
  const workspaceName = (companyName || `Компания ${local}`).slice(0, 120);
  const fullName = (companyName || local).slice(0, 120);

  return {
    ok: true,
    value: {
      email,
      password,
      companyName,
      workspaceName,
      fullName,
      login: email
    }
  };
}

export function isEmailTakenError(error: unknown): boolean {
  if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return message.includes("уже существует");
}
