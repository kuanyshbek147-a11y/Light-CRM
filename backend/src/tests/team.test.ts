import assert from "node:assert/strict";
import test from "node:test";
import { validateNewTeamUser } from "../modules/team/validation";

test("сотрудник без почты получает служебный адрес по логину", () => {
  const result = validateNewTeamUser({ fullName: " Айгерим ", login: "Aigerim", password: "password1" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.fullName, "Айгерим");
    assert.equal(result.value.login, "aigerim");
    assert.equal(result.value.email, "aigerim@staff.lightcrm.local");
    assert.equal(result.value.role, "manager");
  }
});

test("роль администратора — только если выбрана явно", () => {
  const admin = validateNewTeamUser({ fullName: "A", login: "boss", password: "password1", role: "admin" });
  assert.equal(admin.ok && admin.value.role, "admin");
  const other = validateNewTeamUser({ fullName: "A", login: "boss2", password: "password1", role: "superadmin" });
  assert.equal(other.ok && other.value.role, "manager");
});

test("понятные ошибки формы", () => {
  assert.deepEqual(validateNewTeamUser({ login: "ok_login", password: "password1" }), {
    ok: false,
    error: "Укажите имя сотрудника"
  });
  assert.equal(validateNewTeamUser({ fullName: "A", login: "аб", password: "password1" }).ok, false);
  assert.equal(validateNewTeamUser({ fullName: "A", login: "anna", password: "short" }).ok, false);
  assert.equal(validateNewTeamUser({ fullName: "A", login: "anna", email: "bad", password: "password1" }).ok, false);
});
