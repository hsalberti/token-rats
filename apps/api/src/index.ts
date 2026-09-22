import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import { checkHealth } from "./lib/health.js";
import type { AuthVariables } from "./middleware/auth.js";
import abuseRoutes from "./routes/abuse.js";
import adminRoutes from "./routes/admin.js";
import twitterAuthRoutes from "./routes/auth-twitter.js";
import authRoutes from "./routes/auth.js";
import challengesRoutes from "./routes/challenges.js";
import cliRoutes from "./routes/cli.js";
import devicesRoutes from "./routes/devices.js";
import friendsRoutes from "./routes/friends.js";
import groupsRoutes from "./routes/groups.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import liveRoutes from "./routes/live.js";
import meRoutes from "./routes/me.js";
import notificationsRoutes from "./routes/notifications.js";
import orgsRoutes from "./routes/orgs.js";
import profilesRoutes from "./routes/profiles.js";
import proxyRoutes from "./routes/proxy.js";
import pushRoutes from "./routes/push.js";
import roomAggregatesRoutes from "./routes/room-aggregates.js";
import roomsRoutes from "./routes/rooms.js";
import sessionsRoutes from "./routes/sessions.js";
import streaksRoutes from "./routes/streaks.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import trendingRoutes from "./routes/trending.js";
import { runScheduled } from "./scheduled.js";

import chatProxyRoutes from "./routes/chat-proxy.js";
import communityRoutes from "./routes/community.js";
import comparisonRoutes from "./routes/comparison.js";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// CORS — credentials required for cookie-based auth.
// Always allows the configured WEB_ORIGIN. Localhost origins are reflected
// ONLY when WEB_ORIGIN is itself a localhost origin (i.e. a dev deployment) —
// in production we never reflect arbitrary localhost origins.
const LOCALHOST_ORIGIN_RE = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const webOrigin = c.env.WEB_ORIGIN;
      const devMode = LOCALHOST_ORIGIN_RE.test(webOrigin);
      if (devMode && origin && LOCALHOST_ORIGIN_RE.test(origin)) {
        return origin;
      }
      return webOrigin;
    },
    credentials: true,
  }),
);

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

// Deep probe — exercises D1 + KV with short timeouts. 503 if any dep is down,
// so deploy smoke tests and the canary cron can gate on it.
app.get("/healthz", async (c) => {
  const report = await checkHealth(c.env);
  return c.json(report, report.ok ? 200 : 503);
});

// Shallow liveness — never touches a binding. For an external dead-man switch
// that should only flag a fully unresponsive Worker, not a degraded dependency.
app.get("/healthz/live", (c) => c.json({ ok: true }));

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

app.route("/v1/auth", authRoutes);

/* -------------------------------------------------------------------------- */
/* v1.2 Track AC — Twitter/X OAuth                                             */
/* Mounted at /v1 so it can register both /v1/auth/twitter/* and               */
/* /v1/me/twitter/disconnect without splitting across files.                   */
/* -------------------------------------------------------------------------- */

app.route("/v1", twitterAuthRoutes);

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

app.route("/v1/community", communityRoutes);
app.route("/v1/me/comparison", comparisonRoutes);
app.route("/v1/me", meRoutes);
// v1.2 Track AD — friends derived from shared private rooms.
// Mounted on the me namespace so the path is `/v1/me/friends`.
app.route("/v1/me", friendsRoutes);
// Multi-device — anonymized device list + heartbeat + revoke. Paths land at
// /v1/me/devices, /v1/me/devices/heartbeat, /v1/me/devices/:id/revoke.
app.route("/v1/me", devicesRoutes);

/* -------------------------------------------------------------------------- */
/* Session ingest                                                              */
/* -------------------------------------------------------------------------- */

app.route("/v1/sessions", sessionsRoutes);

/* -------------------------------------------------------------------------- */
/* CLI version surface — powers the in-app "upgrade" banner + sync chip.       */
/* -------------------------------------------------------------------------- */

app.route("/v1/cli", cliRoutes);

/* -------------------------------------------------------------------------- */
/* Rooms (and the streak/challenge/leaderboard/live sub-routes on :code)      */
/* -------------------------------------------------------------------------- */

app.route("/v1/rooms", roomsRoutes);
app.route("/v1/rooms", leaderboardRoutes);
app.route("/v1/rooms", streaksRoutes);
app.route("/v1/rooms", challengesRoutes);
app.route("/v1/rooms", liveRoutes);

/* -------------------------------------------------------------------------- */
/* Public room aggregates (summary, heatmap, group streak)                    */
/* -------------------------------------------------------------------------- */

app.route("/v1/r", roomAggregatesRoutes);

/* -------------------------------------------------------------------------- */
/* Public country-locked group discovery                                       */
/* -------------------------------------------------------------------------- */

app.route("/v1/groups", groupsRoutes);

/* -------------------------------------------------------------------------- */
/* Profiles                                                                    */
/* -------------------------------------------------------------------------- */

app.route("/v1/u", profilesRoutes);

/* -------------------------------------------------------------------------- */
/* Notifications + push                                                        */
/* -------------------------------------------------------------------------- */

app.route("/v1/push", pushRoutes);
app.route("/v1/notifications", notificationsRoutes);

/* -------------------------------------------------------------------------- */
/* Phase 3 — discovery, proxy, orgs                                            */
/* -------------------------------------------------------------------------- */

app.route("/v1/trending", trendingRoutes);
app.route("/v1/abuse", abuseRoutes);
app.route("/v1/proxy", proxyRoutes);
app.route("/v1/proxy", chatProxyRoutes);
app.post("/v1/orgs", (c) =>
  c.json(
    { error: "org_creation_paused", message: "Organization plans are paused. Join the community." },
    503,
  ),
);
app.route("/v1/orgs", orgsRoutes);
app.route("/webhooks/stripe", stripeWebhookRoutes);

/* -------------------------------------------------------------------------- */
/* Admin analytics (project-owner only — gated by ADMIN_GITHUB_LOGIN)         */
/* -------------------------------------------------------------------------- */

app.route("/v1/admin", adminRoutes);

/* -------------------------------------------------------------------------- */
/* Error + 404 handlers — log server-side, never leak internals to the client */
/* -------------------------------------------------------------------------- */

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((err, c) => {
  console.error("[api] unhandled error", c.req.method, c.req.path, err);
  return c.json({ error: "internal_error" }, 500);
});

/* -------------------------------------------------------------------------- */
/* Worker exports                                                              */
/* -------------------------------------------------------------------------- */

export { RoomLiveHub } from "./lib/room-live-hub.js";

export default {
  fetch: app.fetch.bind(app),
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(event, env));
  },
};
