import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_CHANNEL_REQUEST_TEXT,
  closeOnboarding,
  emptyOnboardingState,
  markOnboardingSeen,
  migrateLegacyOnboarding,
  shouldAutoOpenFirstRun,
  withOnboardingStep,
  workspaceMessagingChannelConnected,
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
  assert.match(ADMIN_CHANNEL_REQUEST_TEXT, /Интеграции/);
  assert.equal(ADMIN_CHANNEL_REQUEST_TEXT.split(/[.!?]/).filter((part) => part.trim()).length <= 2, true);
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
  assert.equal(closed.seen, true);
  assert.deepEqual(closed.steps, { channel: true, lead: true, next: true });
});

test("старые галочки не считаются сделанными шагами", () => {
  const migrated = migrateLegacyOnboarding({
    status: "pending",
    steps: { channel: true, lead: true, next: true }
  });
  assert.equal(migrated.seen, true);
  assert.equal(migrated.status, "pending");
  assert.deepEqual(migrated.steps, { channel: false, lead: false, next: false });
});

test("мастер сам открывается один раз, пока его не закрыли", () => {
  const fresh = emptyOnboardingState();
  assert.equal(fresh.seen, false);
  assert.equal(shouldAutoOpenFirstRun(fresh, "manager"), true);
  assert.equal(shouldAutoOpenFirstRun(fresh, "admin"), true);
  assert.equal(shouldAutoOpenFirstRun(fresh, "superadmin"), false);
  assert.equal(shouldAutoOpenFirstRun(markOnboardingSeen(fresh), "manager"), false);
  assert.equal(shouldAutoOpenFirstRun(closeOnboarding(fresh, "skip"), "manager"), false);
});

test("канал засчитан только по подключению кабинета, не по общей настройке сервера", () => {
  assert.equal(workspaceMessagingChannelConnected({ whatsappConnected: true }), true);
  assert.equal(
    workspaceMessagingChannelConnected({
      instagramConnected: true,
      instagramSource: "env",
      telegramConnected: true,
      telegramSource: "env"
    }),
    false
  );
  assert.equal(
    workspaceMessagingChannelConnected({
      telegramConnected: true,
      telegramSource: "workspace"
    }),
    true
  );
  assert.equal(workspaceMessagingChannelConnected({}), false);
});
