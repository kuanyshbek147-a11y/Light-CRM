export const REGISTER_MIN_PASSWORD_LENGTH = 8;

export const REGISTER_COPY = {
  emailRequired: "Укажите email",
  emailInvalid: "Похоже, email написан с ошибкой",
  passwordRequired: "Придумайте пароль",
  passwordShort: "Пароль слишком короткий — нужно минимум 8 символов",
  passwordHelper: "Минимум 8 символов",
  emailTaken: "Этот email уже зарегистрирован. Войдите или укажите другой.",
  failed: "Не удалось создать аккаунт. Попробуйте ещё раз.",
  loginFailed: "Неверный логин или пароль"
} as const;

export type RegisterField = "email" | "password" | "companyName";

export type RegisterFieldErrors = Partial<Record<RegisterField, string>>;

export type RegisterSessionUser = {
  id?: string;
  email: string;
  fullName: string;
  role: string;
  login: string | null;
  color?: string | null;
};

export type RegisterSuccess = {
  ok: true;
  token: string;
  user: RegisterSessionUser | null;
};

export type RegisterFailure = {
  ok: false;
  fieldErrors: RegisterFieldErrors;
  banner: string;
};

export type RegisterResult = RegisterSuccess | RegisterFailure;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isSelfServeRegistrationEnabled(flag: string | undefined): boolean {
  return flag !== "false";
}

export function validateRegisterForm(input: {
  email: string;
  password: string;
  companyName?: string;
}): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};
  const email = input.email.trim();
  const companyName = (input.companyName || "").trim();

  if (!email) {
    errors.email = REGISTER_COPY.emailRequired;
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = REGISTER_COPY.emailInvalid;
  }

  if (!input.password) {
    errors.password = REGISTER_COPY.passwordRequired;
  } else if (input.password.length < REGISTER_MIN_PASSWORD_LENGTH) {
    errors.password = REGISTER_COPY.passwordShort;
  }

  if (companyName.length > 120) {
    errors.companyName = "Название компании слишком длинное";
  }

  return errors;
}

type RegisterResponseBody = {
  token?: string;
  user?: RegisterSessionUser;
  error?: string;
  field?: string;
};

export function mapRegisterResponse(status: number, data: RegisterResponseBody): RegisterResult {
  if (status === 201 && data.token) {
    return { ok: true, token: data.token, user: data.user ?? null };
  }

  if (status === 409) {
    return {
      ok: false,
      fieldErrors: { email: REGISTER_COPY.emailTaken },
      banner: ""
    };
  }

  if (status === 400) {
    const field =
      data.field === "email" || data.field === "password" || data.field === "companyName" ? data.field : undefined;
    const message = data.error && data.error !== REGISTER_COPY.loginFailed ? data.error : "";
    if (field && message) {
      return { ok: false, fieldErrors: { [field]: message }, banner: "" };
    }
  }

  return { ok: false, fieldErrors: {}, banner: REGISTER_COPY.failed };
}
