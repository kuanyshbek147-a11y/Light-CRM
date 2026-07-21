/** Demo booking contacts for landing CTA (founder-led sales). */

const DEFAULT_WHATSAPP = "77003131055";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function getDemoWhatsAppNumber(): string {
  const fromEnv = (import.meta.env.VITE_DEMO_WHATSAPP as string | undefined)?.trim();
  return digitsOnly(fromEnv || DEFAULT_WHATSAPP);
}

export function getDemoTelegramUsername(): string {
  const fromEnv = (import.meta.env.VITE_DEMO_TELEGRAM as string | undefined)?.trim() || "";
  return fromEnv.replace(/^@/, "");
}

export function buildDemoWhatsAppUrl(message?: string): string {
  const phone = getDemoWhatsAppNumber();
  const text =
    message ||
    "Здравствуйте! Хочу записаться на демо Light CRM (пилот 14 дней).";
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function buildDemoTelegramUrl(message?: string): string | null {
  const username = getDemoTelegramUsername();
  if (!username) {
    return null;
  }
  const text =
    message ||
    "Здравствуйте! Хочу записаться на демо Light CRM (пилот 14 дней).";
  return `https://t.me/${username}?text=${encodeURIComponent(text)}`;
}
