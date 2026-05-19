/**
 * Email sending — calls Resend's REST API.
 *
 * When `EMAIL_PROVIDER_API_KEY` is unset we fall back to a console-log stub so
 * `pnpm dev`, `vitest`, and `wrangler dev` keep working without secrets.
 *
 * Sender is hardcoded as a constant; move it to a Worker var when we need
 * per-environment override (staging vs prod).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Default sender. Must be a verified Resend domain. */
export const DEFAULT_FROM = "Token Rats <digest@tokenrats.com>";

interface ResendResponse {
  id?: string;
  message?: string;
  name?: string;
}

/**
 * Send an email via Resend. Falls back to a logging stub when the key is unset.
 */
export async function sendEmail(
  message: EmailMessage,
  apiKey: string | undefined,
): Promise<SendEmailResult> {
  if (!apiKey) {
    console.log("[email] (stub) Would send:", {
      to: message.to,
      subject: message.subject,
      textPreview: message.text.slice(0, 100),
    });
    return { ok: true, id: `stub-${Date.now()}` };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as ResendResponse;

    if (!res.ok || !data.id) {
      const error = data.message ?? `Resend HTTP ${res.status}`;
      console.warn("[email] Resend failed:", error);
      return { ok: false, error };
    }

    return { ok: true, id: data.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn("[email] Resend threw:", error);
    return { ok: false, error };
  }
}
