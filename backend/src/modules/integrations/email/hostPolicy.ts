import dns from "dns/promises";
import net from "net";
import type { EmailProvider } from "./credentials";
import { resolveEmailProviderPreset } from "./providers";

const ALLOWED_MAIL_PORTS = new Set([25, 143, 465, 587, 993]);

export type ResolvedMailEndpoint = {
  hostname: string;
  ip: string;
  port: number;
};

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a >= 224) {
    return true;
  }
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (normalized.startsWith("fe80")) {
    return true;
  }
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (net.isIP(mapped) === 4) {
      return isBlockedIpv4(mapped);
    }
  }
  return false;
}

export function isBlockedIp(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    return isBlockedIpv4(ip);
  }
  if (version === 6) {
    return isBlockedIpv6(ip);
  }
  return true;
}

/** Resolve host once, reject private/metadata IPs, return pinned IP for connect. */
export async function resolveSafeMailEndpoint(
  host: string,
  port: number,
  label: string
): Promise<ResolvedMailEndpoint> {
  const normalized = normalizeHost(host);
  if (!normalized || /[\s/\\]/.test(normalized) || normalized.includes(":")) {
    throw new Error(`Некорректный ${label} хост`);
  }
  if (!ALLOWED_MAIL_PORTS.has(port)) {
    throw new Error(`Порт ${port} для ${label} запрещён. Разрешены: 25, 143, 465, 587, 993`);
  }

  if (net.isIP(normalized)) {
    if (isBlockedIp(normalized)) {
      throw new Error(`${label} хост указывает на запрещённый/внутренний адрес`);
    }
    return { hostname: normalized, ip: normalized, port };
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost") || normalized.endsWith(".local")) {
    throw new Error(`${label} хост указывает на локальный адрес`);
  }

  let addresses: string[] = [];
  try {
    const results = await dns.lookup(normalized, { all: true, verbatim: true });
    addresses = results.map((item) => item.address);
  } catch {
    throw new Error(`Не удалось разрешить ${label} хост: ${normalized}`);
  }

  const publicAddresses = addresses.filter((address) => !isBlockedIp(address));
  if (publicAddresses.length === 0) {
    throw new Error(`${label} хост резолвится во внутренний/запрещённый адрес`);
  }

  return { hostname: normalized, ip: publicAddresses[0], port };
}

export async function assertSafeMailEndpoint(host: string, port: number, label: string): Promise<void> {
  await resolveSafeMailEndpoint(host, port, label);
}

export async function assertSafeMailCredentials(credentials: {
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}): Promise<void> {
  if (credentials.provider !== "custom") {
    const preset = resolveEmailProviderPreset(credentials.provider);
    if (
      credentials.smtpHost !== preset.smtpHost ||
      credentials.smtpPort !== preset.smtpPort ||
      credentials.imapHost !== preset.imapHost ||
      credentials.imapPort !== preset.imapPort
    ) {
      throw new Error("Для выбранного провайдера SMTP/IMAP серверы задаются системой и не могут быть изменены");
    }
  }

  // Always resolve+validate (also for presets) immediately before use — blocks private IPs / rebinding targets.
  await resolveSafeMailEndpoint(credentials.smtpHost, credentials.smtpPort, "SMTP");
  await resolveSafeMailEndpoint(credentials.imapHost, credentials.imapPort, "IMAP");
}

export async function resolveSafeMailCredentials(credentials: {
  provider: EmailProvider;
  smtpHost: string;
  smtpPort: number;
  imapHost: string;
  imapPort: number;
}): Promise<{ smtp: ResolvedMailEndpoint; imap: ResolvedMailEndpoint }> {
  await assertSafeMailCredentials(credentials);
  const [smtp, imap] = await Promise.all([
    resolveSafeMailEndpoint(credentials.smtpHost, credentials.smtpPort, "SMTP"),
    resolveSafeMailEndpoint(credentials.imapHost, credentials.imapPort, "IMAP")
  ]);
  return { smtp, imap };
}
