import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import type { AuthVariables } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import challengesRoutes from "./routes/challenges.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import meRoutes from "./routes/me.js";
import notificationsRoutes from "./routes/notifications.js";
import profilesRoutes from "./routes/profiles.js";
import pushRoutes from "./routes/push.js";
import roomsRoutes from "./routes/rooms.js";
import sessionsRoutes from "./routes/sessions.js";
import streaksRoutes from "./routes/streaks.js";
import { runWeeklyDigests } from "./scheduled.js";

const app = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// CORS — credentials required for cookie-based auth
app.use(
  "*",
  cors({
    origin: (origin, c) => c.env.WEB_ORIGIN,
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
/* Rooms (and the streak/challenge/leaderboard sub-routes that share :code)   */
/* -------------------------------------------------------------------------- */

app.route("/v1/rooms", roomsRoutes);
app.route("/v1/rooms", leaderboardRoutes);
app.route("/v1/rooms", streaksRoutes);
app.route("/v1/rooms", challengesRoutes);

/* -------------------------------------------------------------------------- */
/* Profiles                                                                    */
/* -------------------------------------------------------------------------- */

app.route("/v1/u", profilesRoutes);

/* -------------------------------------------------------------------------- */
/* Notifications + push                                                        */
/* -------------------------------------------------------------------------- */

app.route("/v1/push", pushRoutes);
app.route("/v1/notifications", notificationsRoutes);

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runWeeklyDigests(env));
  },
};
