/** Short incoming-message chime via Web Audio (no asset file). */

let audioCtx: AudioContext | null = null;
let unlocked = false;
let lastPlayedAt = 0;

function getAudioContext(): AudioContext | null {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    return null;
  }
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  return audioCtx;
}

/** Call once after a user gesture so browsers allow playback later. */
export function unlockNotificationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  void ctx.resume().then(() => {
    unlocked = true;
  });
}

function tone(
  ctx: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  gainValue: number
): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

export function playIncomingMessageSound(): void {
  const now = Date.now();
  if (now - lastPlayedAt < 400) {
    return;
  }
  lastPlayedAt = now;

  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }

  const run = (): void => {
    unlocked = true;
    const t0 = ctx.currentTime;
    tone(ctx, 880, t0, 0.12, 0.08);
    tone(ctx, 1175, t0 + 0.1, 0.16, 0.07);
  };

  if (ctx.state === "suspended") {
    void ctx.resume().then(run).catch(() => undefined);
    return;
  }
  run();
}

export function isNotificationSoundUnlocked(): boolean {
  return unlocked;
}
