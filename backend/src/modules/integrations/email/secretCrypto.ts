import crypto from "crypto";

const PREFIX = "enc:v1:";
const WEAK_PLACEHOLDERS = new Set([
  "",
  "dev-email-credentials-key",
  "dev-email-credentials-change-me",
  "change-me",
  "secret"
]);

function resolveKeyMaterial(): Buffer {
  const raw = (process.env.EMAIL_CREDENTIALS_KEY || process.env.SECRETS_ENCRYPTION_KEY || "").trim();
  const isProd = process.env.NODE_ENV === "production";

  if (!raw) {
    throw new Error(
      "EMAIL_CREDENTIALS_KEY is required for email password encryption. Set a strong 32-byte secret (hex/base64/passphrase)."
    );
  }

  if (WEAK_PLACEHOLDERS.has(raw.toLowerCase()) || raw === "dev-secret") {
    if (isProd) {
      throw new Error("EMAIL_CREDENTIALS_KEY must not use a weak/default value in production");
    }
    console.warn(
      "[security] EMAIL_CREDENTIALS_KEY uses a weak/default value — set a strong unique secret before production"
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const asBase64 = Buffer.from(raw, "base64");
    if (asBase64.length === 32) {
      return asBase64;
    }
  } catch {
    /* fall through */
  }

  return crypto.createHash("sha256").update(`email-creds:${raw}`).digest();
}

export function encryptSecret(plaintext: string): string {
  const key = resolveKeyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string): string {
  if (!value.startsWith(PREFIX)) {
    // Legacy plaintext passwords stored before encryption.
    return value;
  }

  const payload = value.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Повреждённый зашифрованный пароль почты");
  }

  const key = resolveKeyMaterial();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(value: string): boolean {
  return value.startsWith(PREFIX);
}
