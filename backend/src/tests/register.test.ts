import assert from "node:assert/strict";
import test from "node:test";
import { isEmailTakenError, validateRegisterBody } from "../modules/auth/register";

test("пустые email и пароль — отдельные ошибки полей", () => {
  const email = validateRegisterBody({ email: "  ", password: "" });
  assert.equal(email.ok, false);
  if (!email.ok) {
    assert.equal(email.field, "email");
    assert.equal(email.error, "Укажите email");
  }

  const password = validateRegisterBody({ email: "owner@example.com", password: "" });
  assert.equal(password.ok, false);
  if (!password.ok) {
    assert.equal(password.field, "password");
    assert.equal(password.error, "Придумайте пароль");
  }
});

test("короткий пароль и кривой email", () => {
  const email = validateRegisterBody({ email: "not-an-email", password: "12345678" });
  assert.equal(email.ok, false);
  if (!email.ok) {
    assert.equal(email.error, "Похоже, email написан с ошибкой");
  }

  const password = validateRegisterBody({ email: "owner@example.com", password: "short" });
  assert.equal(password.ok, false);
  if (!password.ok) {
    assert.equal(password.error, "Пароль слишком короткий — нужно минимум 8 символов");
  }
});

test("компания необязательна, логин совпадает с email", () => {
  const result = validateRegisterBody({
    email: " Owner@Example.com ",
    password: "password1",
    companyName: "  "
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.email, "owner@example.com");
    assert.equal(result.value.login, "owner@example.com");
    assert.equal(result.value.companyName, "");
    assert.equal(result.value.workspaceName, "Компания owner");
    assert.equal(result.value.fullName, "owner");
  }
});

test("название компании становится именем пространства", () => {
  const result = validateRegisterBody({
    email: "a@b.co",
    password: "password1",
    companyName: " ИП Ромашка "
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.workspaceName, "ИП Ромашка");
    assert.equal(result.value.fullName, "ИП Ромашка");
  }
});

test("конфликт email распознаётся по тексту и коду Postgres", () => {
  assert.equal(isEmailTakenError(new Error("Пользователь с таким email или логином уже существует")), true);
  assert.equal(isEmailTakenError({ code: "23505" }), true);
  assert.equal(isEmailTakenError(new Error("connection refused")), false);
});
