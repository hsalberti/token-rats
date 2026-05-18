import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./env.js";
import type { AuthVariables } from "./middleware/auth.js";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import sessionsRoutes from "./routes/sessions.js";
import roomsRoutes from "./routes/rooms.js";
import leaderboardRoutes from "./routes/leaderboard.js";
import profilesRoutes from "./routes/profiles.js";

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
/* Rooms                                                                       */
/* -------------------------------------------------------------------------- */

app.route("/v1/rooms", roomsRoutes);

/* -------------------------------------------------------------------------- */
/* Leaderboard (sub-route of rooms, registered separately to share :code)     */
/* -------------------------------------------------------------------------- */

app.route("/v1/rooms", leaderboardRoutes);

/* -------------------------------------------------------------------------- */
/* Profiles                                                                    */
/* -------------------------------------------------------------------------- */

app.route("/v1/u", profilesRoutes);

export default app;
