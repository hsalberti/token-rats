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
import type { AuthVariables } from "../middleware/auth.js";
import { verifyStripeSignature } from "../lib/stripe.js";
import { internalError } from "../lib/errors.js";

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
  type: string;
  data: {
    object: StripeSubscription;
  };
}

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

  const { type, data } = event;

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
    const org = await c.env.DB.prepare("SELECT id, plan FROM orgs WHERE stripe_customer_id = ?")
      .bind(subscription.customer)
      .first<{ id: string; plan: string }>();

    if (!org) {
      // No matching org — acknowledge anyway so Stripe doesn't retry
      return c.json({ received: true, note: "org_not_found" });
    }

    // v1.2 Track AA — student orgs are free-by-policy. We ignore Stripe events
    // for them so an admin-approved student tier can't be silently bumped to
    // 'pro' or downgraded to 'free' by an inbound subscription event. The
    // student plan is locked in via the admin approve endpoint.
    if (org.plan === "student") {
      return c.json({ received: true, note: "student_plan_no_op" });
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
