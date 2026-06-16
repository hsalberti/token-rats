/**
 * Stripe webhook handler — Phase 3 Track O
 *
 * POST /webhooks/stripe
 *
 * Verifies the Stripe-Signature header using pure Web Crypto (no Stripe SDK).
 * Handles:
 *   - customer.subscription.created
 *   - customer.subscription.updated
 *   - customer.subscription.deleted
 *
 * On subscription events, reconciles:
 *   - orgs.plan          ("pro" when active, "free" when canceled/past_due)
 *   - orgs.stripe_subscription_id
 *   - orgs.seat_count    (from subscription.quantity)
 */

import { Hono } from "hono";
import type { Env } from "../env.js";
import { internalError } from "../lib/errors.js";
import { verifyStripeSignature } from "../lib/stripe.js";
import type { AuthVariables } from "../middleware/auth.js";

type HonoEnv = { Bindings: Env; Variables: AuthVariables };

const stripeWebhook = new Hono<HonoEnv>();

/* ------------------------------------------------------------------ types */

interface StripeSubscription {
  id: string;
  status: string; // active | trialing | past_due | canceled | unpaid | ...
  customer: string; // stripe_customer_id
  quantity: number | null;
  items?: {
    data?: Array<{ quantity?: number }>;
  };
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeSubscription;
  };
}

/**
 * Idempotency window for processed Stripe events. Stripe retries a failing
 * webhook for up to ~3 days, so a 7-day TTL safely covers the retry horizon
 * while letting KV expire the marker automatically.
 */
const EVENT_DEDUPE_TTL = 60 * 60 * 24 * 7;

/* ------------------------------------------------------------------ handler */

stripeWebhook.post("/", async (c) => {
  // Read raw body as text BEFORE any JSON parsing (required for HMAC verification)
  const rawBody = await c.req.text();

  const sigHeader = c.req.header("stripe-signature");
  if (!sigHeader) {
    return c.json({ error: "Missing Stripe-Signature header" }, 400);
  }

  const result = await verifyStripeSignature(rawBody, sigHeader, c.env.STRIPE_WEBHOOK_SECRET);

  if (!result.ok) {
    return c.json({ error: `Signature verification failed: ${result.reason}` }, 400);
  }

  // Parse the event
  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { id: eventId, type, data } = event;

  // Idempotency: Stripe delivers at-least-once and retries on any non-2xx.
  // Persist each processed event.id and no-op on repeats so a retried delivery
  // can't double-apply a plan/seat change. Signature verification above stays
  // the gate — we only reach here for authentic events.
  if (eventId) {
    const dedupeKey = `stripe:event:${eventId}`;
    const seen = await c.env.CACHE.get(dedupeKey);
    if (seen) {
      return c.json({ received: true, note: "duplicate" });
    }
    await c.env.CACHE.put(dedupeKey, "1", { expirationTtl: EVENT_DEDUPE_TTL });
  }

  // Handle subscription lifecycle events
  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted"
  ) {
    const subscription = data.object;

    // Determine quantity (seat count)
    // Stripe stores quantity on the subscription line items; fall back to top-level quantity
    const quantity = subscription.items?.data?.[0]?.quantity ?? subscription.quantity ?? 0;

    // Map subscription status → plan tier
    // "active" and "trialing" = pro; anything else = free
    const plan =
      subscription.status === "active" || subscription.status === "trialing" ? "pro" : "free";

    // Find the org by stripe_customer_id
    const org = await c.env.DB.prepare("SELECT id FROM orgs WHERE stripe_customer_id = ?")
      .bind(subscription.customer)
      .first<{ id: string }>();

    if (!org) {
      // No matching org — acknowledge anyway so Stripe doesn't retry
      return c.json({ received: true, note: "org_not_found" });
    }

    try {
      await c.env.DB.prepare(
        `UPDATE orgs
         SET plan = ?,
             stripe_subscription_id = ?,
             seat_count = ?
         WHERE id = ?`,
      )
        .bind(
          plan,
          type === "customer.subscription.deleted" ? null : subscription.id,
          plan === "free" ? 0 : quantity,
          org.id,
        )
        .run();
    } catch (err) {
      console.error("stripe-webhook: DB update failed", err);
      return internalError(c, "Failed to update org plan");
    }
  }

  // Acknowledge all events (including unhandled ones)
  return c.json({ received: true });
});

export default stripeWebhook;
