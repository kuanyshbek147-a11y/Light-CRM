import type { EmailProvider } from "./credentials";

export type EmailProviderPreset = {
  id: EmailProvider;
  label: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  hint: string;
};

export const EMAIL_PROVIDER_PRESETS: EmailProviderPreset[] = [
  {
    id: "gmail",
    label: "Gmail",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
    hint: "Обычный пароль Gmail не подойдёт. Включите 2FA → создайте пароль приложения (Почта) на https://myaccount.google.com/apppasswords и вставьте его сюда (16 символов)."
  },
  {
    id: "yandex",
    label: "Yandex",
    smtpHost: "smtp.yandex.ru",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.yandex.ru",
    imapPort: 993,
    imapSecure: true,
    hint: "Включите IMAP в настройках Яндекс Почты."
  },
  {
    id: "mailru",
    label: "Mail.ru",
    smtpHost: "smtp.mail.ru",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.mail.ru",
    imapPort: 993,
    imapSecure: true,
    hint: "Используйте пароль для внешнего приложения."
  },
  {
    id: "outlook",
    label: "Outlook / Office 365",
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecure: true,
    hint: "Для корпоративных аккаунтов может потребоваться app password."
  },
  {
    id: "custom",
    label: "Свой сервер",
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
    hint: "Укажите SMTP и IMAP вручную."
  }
];

export function resolveEmailProviderPreset(provider: EmailProvider): EmailProviderPreset {
  return EMAIL_PROVIDER_PRESETS.find((item) => item.id === provider) || EMAIL_PROVIDER_PRESETS[4];
}
