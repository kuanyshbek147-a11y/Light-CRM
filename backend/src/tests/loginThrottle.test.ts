import assert from "node:assert/strict";
import test from "node:test";
import { LoginThrottle } from "../modules/auth/loginThrottle";

test("после 3 неудач вход закрыт, потом снова открыт", () => {
  let now = 0;
  const throttle = new LoginThrottle(3, 60_000, () => now);
  for (let i = 0; i < 3; i += 1) {
    assert.equal(throttle.retryAfterSeconds("1.1.1.1", "admin"), 0);
    throttle.recordFailure("1.1.1.1", "Admin");
  }
  assert.equal(throttle.retryAfterSeconds("1.1.1.1", "admin"), 60);
  assert.equal(throttle.retryAfterSeconds("2.2.2.2", "admin"), 0, "другой IP не блокируется");
  now = 60_000;
  assert.equal(throttle.retryAfterSeconds("1.1.1.1", "admin"), 0);
});

test("успешный вход обнуляет счётчик", () => {
  const throttle = new LoginThrottle(2, 60_000, () => 0);
  throttle.recordFailure("ip", "user");
  throttle.recordSuccess("ip", "user");
  throttle.recordFailure("ip", "user");
  assert.equal(throttle.retryAfterSeconds("ip", "user"), 0);
});
