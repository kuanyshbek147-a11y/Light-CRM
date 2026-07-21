import nodemailer from "nodemailer";
import type { EmailCredentials } from "./credentials";
import { resolveSafeMailEndpoint } from "./hostPolicy";

async function createPinnedSmtpTransport(credentials: EmailCredentials) {
  const endpoint = await resolveSafeMailEndpoint(credentials.smtpHost, credentials.smtpPort, "SMTP");
  return nodemailer.createTransport({
    host: endpoint.ip,
    port: endpoint.port,
    secure: credentials.smtpSecure,
    auth: {
      user: credentials.email,
      pass: credentials.password
    },
    tls: {
      servername: endpoint.hostname
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000
  });
}

export async function verifyEmailSmtp(credentials: EmailCredentials): Promise<void> {
  const transporter = await createPinnedSmtpTransport(credentials);
  await transporter.verify();
}

export async function sendEmailMessage(params: {
  credentials: EmailCredentials;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string | null;
}): Promise<string | null> {
  const transporter = await createPinnedSmtpTransport(params.credentials);

  const info = await transporter.sendMail({
    from: `"${params.credentials.displayName}" <${params.credentials.email}>`,
    to: params.to,
    subject: params.subject,
    text: params.text,
    inReplyTo: params.inReplyTo || undefined,
    references: params.references || undefined
  });

  return typeof info.messageId === "string" ? info.messageId : null;
}
