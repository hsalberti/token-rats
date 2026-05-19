import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import type { AuthVariables } from "./middleware/auth.js";
import abuseRoutes from "./routes/abuse.js";
import authRoutes from "./routes/auth.js";
import challengesRoutes from "./routes/challenges.js";
import groupStreakRoutes from "./routes/group-streak.js";
import heatmapRoutes from "./routes/heatmap.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import liveRoutes from "./routes/live.js";
import meRoutes from "./routes/me.js";
import roomSummaryRoutes from "./routes/room-summary.js";
import notificationsRoutes from "./routes/notifications.js";
import orgsRoutes from "./routes/orgs.js";
import profilesRoutes from "./routes/profiles.js";
import proxyRoutes from "./routes/proxy.js";
import pushRoutes from "./routes/push.js";
import roomsRoutes from "./routes/rooms.js";
import sessionsRoutes from "./routes/sessions.js";
import streaksRoutes from "./routes/streaks.js";
import stripeWebhookRoutes from "./routes/stripe-webhook.js";
import trendingRoutes from "./routes/trending.js";
import { runWeeklyDigests } from "./scheduled.js";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// CORS — credentials required for cookie-based auth.
// Accepts the configured WEB_ORIGIN plus localhost on any port for local dev.
// (Localhost can never present a valid prod cookie — different origin — so
// allowing it everywhere is safe and removes the wrangler-3 `.dev.vars` quirk
// where vars defined there don't override `[vars]` in wrangler.toml.)
app.use(
  "*",
  cors({
    origin: (origin, c) => {
      if (origin && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return origin;
      }
      return c.env.WEB_ORIGIN;
    },
    credentials: true,
  }),
);

/* -------------------------------------------------------------------------- */
/* Health                                                                      */
/* -------------------------------------------------------------------------- */

app.get("/healthz", (c) => c.json({ ok: true, ts: Date.now() }));

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

app.route("/v1/auth", authRoutes);

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

app.route("/v1/me", meRoutes);

/* -------------------------------------------------------------------------- */
/* Session ingest                                                              */
/* -------------------------------------------------------------------------- */

app.route("/v1/sessions", sessionsRoutes);

/* -------------------------------------------------------------------------- */
/* Rooms (and the streak/challenge/leaderboard/live sub-routes on :code)      */
/* -------------------------------------------------------------------------- */

app.route("/v1/rooms", roomsRoutes);
app.route("/v1/rooms", leaderboardRoutes);
app.route("/v1/rooms", streaksRoutes);
app.route("/v1/rooms", challengesRoutes);
app.route("/v1/rooms", liveRoutes);
app.route("/v1/rooms", roomSummaryRoutes);
app.route("/v1/rooms", groupStreakRoutes);

/* -------------------------------------------------------------------------- */
/* Generalized heatmap (v1.2 Track Y)                                          */
/* -------------------------------------------------------------------------- */

app.route("/v1", heatmapRoutes);

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
app.route("/v1/orgs", orgsRoutes);
app.route("/webhooks/stripe", stripeWebhookRoutes);

/* -------------------------------------------------------------------------- */
/* Worker exports                                                              */
/* -------------------------------------------------------------------------- */

export { RoomLiveHub } from "./lib/room-live-hub.js";

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runWeeklyDigests(env));
  },
};
