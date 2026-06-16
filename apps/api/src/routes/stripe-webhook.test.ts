/**
 * Tests for POST /webhooks/stripe.
 *
 * Covers the three things that matter for a billing webhook:
 *   - Event dispatch: a subscription.created/updated/deleted reconciles
 *     orgs.plan / seat_count / stripe_subscription_id correctly.
 *   - Idempotency: Stripe retries the same event; replaying it must converge
 *     on the same org state (the handler's UPDATE is deterministic).
 *   - Unknown events: any non-subscription type is acknowledged with no DB write.
 *
 * Signatures are produced with the real verifier's expected format so the
 * handler's verification passes; an in-memory org row tracks the reconciled state.
 */

import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env.js";
import type { AuthVariables } from "../middleware/auth.js";
import stripeWebhook from "./stripe-webhook.js";

const WEBHOOK_SECRET = "whsec_test_secret_for_route_tests";

interface OrgRow {
  id: string;
  stripe_customer_id: string;
  plan: string;
  stripe_subscription_id: string | null;
  seat_count: number;
}

/** A D1 mock backed by a single mutable orgs row, plus a write counter. */
function makeD1(org: OrgRow | null) {
  let writes = 0;
  const db = {
    prepare: vi.fn((sql: string) => {
      let bound: unknown[] = [];
      return {
        bind: vi.fn((...args: unknown[]) => {
          bound = args;
          return {
            first: vi.fn(() => {
              if (sql.includes("FROM orgs WHERE stripe_customer_id")) {
                return Promise.resolve(
                  org && org.stripe_customer_id === bound[0] ? { id: org.id } : null,
                );
              }
              return Promise.resolve(null);
            }),
            run: vi.fn(() => {
              if (sql.includes("UPDATE orgs") && org) {
                writes += 1;
                // bind order: plan, stripe_subscription_id, seat_count, id
                org.plan = bound[0] as string;
                org.stripe_subscription_id = bound[1] as string | null;
                org.seat_count = bound[2] as number;
              }
              return Promise.resolve({ meta: { changes: 1 } });
            }),
          };
        }),
      };
    }),
  } as unknown as D1Database;
  return { db, getWrites: () => writes };
}

function makeApp(env: Env) {
  const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
  app.route("/webhooks/stripe", stripeWebhook);
  return { fetch: (req: Request) => app.fetch(req, env) };
}

/** Build a valid Stripe-Signature header for a raw body. */
async function signHeader(body: string, secret: string, timestampSec: number): Promise<string> {
  const signedPayload = `${timestampSec}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    { name: "HMAC", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signedPayload),
  );
  const sigHex = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `t=${timestampSec},v1=${sigHex}`;
}

async function postEvent(app: ReturnType<typeof makeApp>, event: unknown): Promise<Response> {
  const body = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signHeader(body, WEBHOOK_SECRET, ts);
  return app.fetch(
    new Request("http://localhost/webhooks/stripe", {
      method: "POST",
      headers: { "stripe-signature": sig, "Content-Type": "application/json" },
      body,
    }),
  );
}

function makeEnv(db: D1Database): Env {
  return { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as unknown as Env;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /webhooks/stripe — signature gate", () => {
  it("rejects a missing signature header with 400", async () => {
    const { db } = makeD1(null);
    const app = makeApp(makeEnv(db));
    const res = await app.fetch(
      new Request("http://localhost/webhooks/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid signature with 400", async () => {
    const { db } = makeD1(null);
    const app = makeApp(makeEnv(db));
    const res = await app.fetch(
      new Request("http://localhost/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": "t=123,v1=deadbeef", "Content-Type": "application/json" },
        body: JSON.stringify({ type: "customer.subscription.created" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("POST /webhooks/stripe — event dispatch", () => {
  it("flips an org to pro on subscription.created and records seats + sub id", async () => {
    const org: OrgRow = {
      id: "org-1",
      stripe_customer_id: "cus_1",
      plan: "free",
      stripe_subscription_id: null,
      seat_count: 0,
    };
    const { db } = makeD1(org);
    const app = makeApp(makeEnv(db));

    const res = await postEvent(app, {
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          customer: "cus_1",
          quantity: null,
          items: { data: [{ quantity: 5 }] },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(org.plan).toBe("pro");
    expect(org.seat_count).toBe(5);
    expect(org.stripe_subscription_id).toBe("sub_1");
  });

  it("downgrades to free and zeroes seats + sub id on subscription.deleted", async () => {
    const org: OrgRow = {
      id: "org-1",
      stripe_customer_id: "cus_1",
      plan: "pro",
      stripe_subscription_id: "sub_1",
      seat_count: 5,
    };
    const { db } = makeD1(org);
    const app = makeApp(makeEnv(db));

    const res = await postEvent(app, {
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: "sub_1",
          status: "canceled",
          customer: "cus_1",
          quantity: 5,
          items: { data: [{ quantity: 5 }] },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(org.plan).toBe("free");
    expect(org.seat_count).toBe(0);
    expect(org.stripe_subscription_id).toBeNull();
  });

  it("acknowledges with a note when no org matches the customer", async () => {
    const { db, getWrites } = makeD1({
      id: "org-1",
      stripe_customer_id: "cus_other",
      plan: "free",
      stripe_subscription_id: null,
      seat_count: 0,
    });
    const app = makeApp(makeEnv(db));

    const res = await postEvent(app, {
      type: "customer.subscription.updated",
      data: {
        object: { id: "sub_x", status: "active", customer: "cus_unknown", quantity: 1 },
      },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true, note: "org_not_found" });
    expect(getWrites()).toBe(0);
  });
});

describe("POST /webhooks/stripe — idempotency", () => {
  it("converges on the same org state when the same event is replayed", async () => {
    const org: OrgRow = {
      id: "org-1",
      stripe_customer_id: "cus_1",
      plan: "free",
      stripe_subscription_id: null,
      seat_count: 0,
    };
    const { db } = makeD1(org);
    const app = makeApp(makeEnv(db));

    const event = {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          customer: "cus_1",
          quantity: null,
          items: { data: [{ quantity: 3 }] },
        },
      },
    };

    await postEvent(app, event);
    const afterFirst = { ...org };
    await postEvent(app, event);

    // A Stripe retry must not double-count seats or mutate the end state.
    expect(org).toEqual(afterFirst);
    expect(org.plan).toBe("pro");
    expect(org.seat_count).toBe(3);
  });
});

describe("POST /webhooks/stripe — unknown events", () => {
  it("acknowledges an unknown event type with no DB write", async () => {
    const { db, getWrites } = makeD1({
      id: "org-1",
      stripe_customer_id: "cus_1",
      plan: "free",
      stripe_subscription_id: null,
      seat_count: 0,
    });
    const app = makeApp(makeEnv(db));

    const res = await postEvent(app, {
      type: "invoice.payment_succeeded",
      data: { object: { id: "in_1", status: "paid", customer: "cus_1", quantity: 1 } },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(getWrites()).toBe(0);
  });
});
