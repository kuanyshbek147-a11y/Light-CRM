import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_CHANNEL_REQUEST_TEXT,
  closeOnboarding,
  emptyOnboardingState,
  withOnboardingStep,
  type OnboardingState
} from "./src/features/onboarding/onboardingStorage.ts";

function state(partial: Partial<OnboardingState> = {}): OnboardingState {
  return {
    ...emptyOnboardingState(),
    ...partial,
    steps: { ...emptyOnboardingState().steps, ...partial.steps }
  };
}

test("просьба администратору называет WhatsApp, Instagram и Telegram", () => {
  assert.match(ADMIN_CHANNEL_REQUEST_TEXT, /WhatsApp/);
  assert.match(ADMIN_CHANNEL_REQUEST_TEXT, /Instagram/);
  assert.match(ADMIN_CHANNEL_REQUEST_TEXT, /Telegram/);
  assert.match(ADMIN_CHANNEL_REQUEST_TEXT, /учебн/);
});

test("«Готово» и «Пропустить» не отмечают незавершённые шаги", () => {
  const pending = state();
  const skipped = closeOnboarding(pending, "skip");
  const dismissed = closeOnboarding(pending, "done");

  assert.equal(skipped.status, "skipped");
  assert.deepEqual(skipped.steps, { channel: false, lead: false, next: false });
  assert.equal(dismissed.status, "skipped");
  assert.deepEqual(dismissed.steps, { channel: false, lead: false, next: false });
});

test("уже сделанный шаг сохраняется, остальные не зеленеют", () => {
  const withChannel = withOnboardingStep(state(), "channel");
  assert.equal(withChannel.steps.channel, true);
  assert.equal(withChannel.steps.lead, false);
  assert.equal(withChannel.steps.next, false);

  const closed = closeOnboarding(withChannel, "done");
  assert.equal(closed.status, "skipped");
  assert.deepEqual(closed.steps, withChannel.steps);
});

test("«Готово» ставит completed только когда все шаги уже отмечены", () => {
  let current = state();
  current = withOnboardingStep(current, "channel");
  current = withOnboardingStep(current, "lead");
  current = withOnboardingStep(current, "next");
  const closed = closeOnboarding(current, "done");
  assert.equal(closed.status, "completed");
  assert.deepEqual(closed.steps, { channel: true, lead: true, next: true });
});
