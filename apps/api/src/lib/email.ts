import type { Env } from "../env.js";
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tags?: { name: string; value: string }[];
  key: string;
  unsubscribe: string;
}
export async function sendEmail(
  env: Env,
  message: EmailMessage,
): Promise<{ ok: boolean; id?: string }> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return { ok: false };
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.key,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        tags: message.tags,
        headers: {
          "List-Unsubscribe": `<${message.unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    if (!response.ok) {
      console.error("[email] provider rejected delivery", response.status);
      return { ok: false };
    }
    const data = (await response.json()) as { id: string };
    return { ok: true, id: data.id };
  } catch {
    console.error("[email] delivery failed");
    return { ok: false };
  }
}
