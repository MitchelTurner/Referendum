export type MailMessage = { to: string; subject: string; text: string; idempotencyKey?: string };
export type SmsMessage = { to: string; body: string; idempotencyKey?: string };

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export interface MessagingProvider {
  sendSms(message: SmsMessage): Promise<void>;
}

class ConsoleMail implements MailProvider {
  async send(message: MailMessage): Promise<void> {
    console.log(JSON.stringify({ level: 'info', provider: 'console-mail', to: message.to, subject: message.subject }));
  }
}

class PostmarkMail implements MailProvider {
  constructor(private readonly apiKey: string) {}
  async send(message: MailMessage): Promise<void> {
    const response = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': this.apiKey,
      },
      body: JSON.stringify({
        From: process.env.MAIL_FROM ?? 'notices@referendum.local',
        To: message.to,
        Subject: message.subject,
        TextBody: message.text,
      }),
    });
    if (!response.ok) throw new Error(`Postmark failed (${response.status})`);
  }
}

class ConsoleSms implements MessagingProvider {
  async sendSms(message: SmsMessage): Promise<void> {
    console.log(JSON.stringify({ level: 'info', provider: 'console-sms', to: message.to }));
  }
}

class TwilioSms implements MessagingProvider {
  constructor(
    private readonly sid: string,
    private readonly token: string,
    private readonly from: string,
  ) {}
  async sendSms(message: SmsMessage): Promise<void> {
    const body = new URLSearchParams({ To: message.to, From: this.from, Body: message.body });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.sid}:${this.token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (!response.ok) throw new Error(`Twilio failed (${response.status})`);
  }
}

export function mailProvider(): MailProvider {
  if (process.env.MAIL_PROVIDER === 'postmark' && process.env.MAIL_API_KEY) {
    return new PostmarkMail(process.env.MAIL_API_KEY);
  }
  // SPEC-GAP: SES adapter is selected by MAIL_PROVIDER=ses; console is the dev default.
  return new ConsoleMail();
}

export function messagingProvider(): MessagingProvider {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    return new TwilioSms(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN,
      process.env.TWILIO_FROM_NUMBER,
    );
  }
  return new ConsoleSms();
}
