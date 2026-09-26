// Защита от подбора пароля: после серии неудачных попыток для пары «IP + логин» вход временно закрыт.
// Хранится в памяти процесса — на одном инстансе Render этого достаточно; при перезапуске счётчики обнуляются.

export const MAX_FAILED_ATTEMPTS = 10;
export const LOCK_WINDOW_MS = 15 * 60 * 1000;

type Entry = { failures: number; firstFailureAt: number };

export class LoginThrottle {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxFailures = MAX_FAILED_ATTEMPTS,
    private readonly windowMs = LOCK_WINDOW_MS,
    private readonly now: () => number = Date.now
  ) {}

  private key(ip: string, login: string): string {
    return `${ip}|${login.trim().toLowerCase()}`;
  }

  /** Сколько секунд ждать, или 0 — можно пробовать. */
  retryAfterSeconds(ip: string, login: string): number {
    const entry = this.entries.get(this.key(ip, login));
    if (!entry) {
      return 0;
    }
    const elapsed = this.now() - entry.firstFailureAt;
    if (elapsed >= this.windowMs) {
      this.entries.delete(this.key(ip, login));
      return 0;
    }
    return entry.failures >= this.maxFailures ? Math.ceil((this.windowMs - elapsed) / 1000) : 0;
  }

  recordFailure(ip: string, login: string): void {
    const key = this.key(ip, login);
    const entry = this.entries.get(key);
    if (!entry || this.now() - entry.firstFailureAt >= this.windowMs) {
      this.entries.set(key, { failures: 1, firstFailureAt: this.now() });
      return;
    }
    entry.failures += 1;
    if (this.entries.size > 10_000) {
      this.prune();
    }
  }

  recordSuccess(ip: string, login: string): void {
    this.entries.delete(this.key(ip, login));
  }

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [key, entry] of this.entries) {
      if (entry.firstFailureAt < cutoff) {
        this.entries.delete(key);
      }
    }
  }
}
