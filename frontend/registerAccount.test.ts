import assert from "node:assert/strict";
import test from "node:test";
import {
  isSelfServeRegistrationEnabled,
  mapRegisterResponse,
  validateRegisterForm
} from "./src/features/auth/registerValidation.ts";

test("пустая форма показывает ошибки email и пароля", () => {
  const errors = validateRegisterForm({ email: "  ", password: "" });
  assert.equal(errors.email, "Укажите email");
  assert.equal(errors.password, "Придумайте пароль");
});

test("неверный формат и короткий пароль", () => {
  const errors = validateRegisterForm({ email: "roman@", password: "1234567" });
  assert.equal(errors.email, "Похоже, email написан с ошибкой");
  assert.equal(errors.password, "Пароль слишком короткий — нужно минимум 8 символов");
});

test("валидная форма без компании проходит", () => {
  const errors = validateRegisterForm({ email: "owner@example.com", password: "password1", companyName: "  " });
  assert.deepEqual(errors, {});
});

test("409 садится на поле email и не использует ошибку входа", () => {
  const result = mapRegisterResponse(409, { error: "Неверный логин или пароль" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.fieldErrors.email, "Этот email уже зарегистрирован. Войдите или укажите другой.");
    assert.equal(result.banner, "");
    assert.equal(JSON.stringify(result).includes("Неверный логин или пароль"), false);
  }
});

test("сеть и 5xx дают баннер, 201 открывает сессию", () => {
  const failed = mapRegisterResponse(503, { error: "База данных временно недоступна" });
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.banner, "Не удалось создать аккаунт. Попробуйте ещё раз.");
  }

  const missing = mapRegisterResponse(404, {});
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.banner, "Не удалось создать аккаунт. Попробуйте ещё раз.");
  }

  const created = mapRegisterResponse(201, {
    token: "jwt",
    user: { email: "a@b.co", fullName: "a", role: "admin", login: "a@b.co" }
  });
  assert.equal(created.ok, true);
  if (created.ok) {
    assert.equal(created.token, "jwt");
    assert.equal(created.user?.role, "admin");
  }
});

test("флаг self-serve выключается только явным false", () => {
  assert.equal(isSelfServeRegistrationEnabled(undefined), true);
  assert.equal(isSelfServeRegistrationEnabled(""), true);
  assert.equal(isSelfServeRegistrationEnabled("false"), false);
});
