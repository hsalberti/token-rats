/**
 * Email sending stub for Token Rats.
 *
 * TODO: Wire in Resend or Postmark here at deploy time.
 * Resend example:
 *   import { Resend } from "resend";
 *   const resend = new Resend(env.RESEND_API_KEY);
 *   await resend.emails.send({ from: "noreply@tokenrats.com", to, subject, html });
 *
 * Postmark example:
 *   const res = await fetch("https://api.postmarkapp.com/email", {
 *     method: "POST",
 *     headers: { "X-Postmark-Server-Token": env.POSTMARK_API_TOKEN, "Content-Type": "application/json" },
 *     body: JSON.stringify({ From: "noreply@tokenrats.com", To: to, Subject: subject, HtmlBody: html, TextBody: text }),
 *   });
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

/**
 * Stub email sender. Logs the intent and returns ok: true.
 * Replace the body of this function with a real email provider call.
 */
export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  console.log("[email] Would send email:", {
    to: message.to,
    subject: message.subject,
    textPreview: message.text.slice(0, 100),
  });
  // TODO: wire Resend/Postmark here at deploy time.
  return { ok: true, id: `stub-${Date.now()}` };
}
