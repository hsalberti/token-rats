/**
 * msw request handlers for Token Rats Playwright suite (v1.2 Track AI).
 *
 * These handlers stub every `/v1/*` endpoint that the web app reaches during
 * the smoke suite. The standalone mock server (`standalone-server.mjs`) runs
 * these handlers via `msw`'s `http.run()` shape so server components fetching
 * `NEXT_PUBLIC_API_URL` (= `http://localhost:8787`) get them too.
 *
 * Handlers stay realistic but minimal — we only return fields the rendering
 * code reads. The fixtures are deterministic so the visual assertions in
 * Playwright are stable.
 */

import { http, HttpResponse } from "msw";

const SESSION_COOKIE = "tr_session";

/** Hard-coded test users. */
const USER_ME = {
  id: "user-me",
  handle: "ratking",
  githubLogin: "ratking",
  avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
  publicProfile: true,
  bio: "test bio",
  twitterHandle: null as string | null,
  twitterVerified: false,
};

const USER_OTHER = {
  id: "user-other",
  handle: "burnerbot",
  githubLogin: "burnerbot",
  avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
  publicProfile: true,
};

/** Test room shared between me + other (private). */
const ROOM_TEST = {
  code: "TEST01",
  name: "Test Room",
  isPublic: false,
  ownerId: USER_ME.id,
  orgId: null as string | null,
  country: null as string | null,
};

/** Public BR group. */
const ROOM_BR = {
  code: "BR0001",
  name: "Brazil Builders",
  isPublic: true,
  ownerId: USER_OTHER.id,
  orgId: null,
  country: "BR",
  memberCount: 12,
};

/** Public US group. */
const ROOM_US = {
  code: "US0001",
  name: "US Top Coders",
  isPublic: true,
  ownerId: USER_OTHER.id,
  orgId: null,
  country: "US",
  memberCount: 8,
};

function hasSessionCookie(request: Request): boolean {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.includes(`${SESSION_COOKIE}=`);
}

function dateNDaysAgo(n: number) {
  const d = new Date("2026-05-19T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Build a heatmap response of arbitrary length. */
function makeHeatmap(scope: "user" | "room", id: string, rangeDays: 60 | 364) {
  const cells = Array.from({ length: rangeDays }, (_, i) => {
    const date = dateNDaysAgo(rangeDays - 1 - i);
    const tokens = i % 7 === 0 ? 0 : 1000 + i * 100;
    return {
      date,
      tokens,
      costUsdCents: Math.round(tokens / 100),
      level: (i % 5) as 0 | 1 | 2 | 3 | 4,
    };
  });
  return {
    scope,
    id,
    from: dateNDaysAgo(rangeDays - 1),
    to: dateNDaysAgo(0),
    rangeDays,
    cells,
  };
}

const TRENDING_ROWS = [
  {
    rank: 1,
    userId: USER_ME.id,
    handle: "ratking",
    avatarUrl: USER_ME.avatarUrl,
    tokens: 5_000_000,
    costUsdCents: 12_500,
    sessions: 42,
    twitterHandle: null,
    primarySource: "claude-code",
  },
  {
    rank: 2,
    userId: USER_OTHER.id,
    handle: "burnerbot",
    avatarUrl: USER_OTHER.avatarUrl,
    tokens: 3_200_000,
    costUsdCents: 7_800,
    sessions: 31,
    twitterHandle: null,
    primarySource: "cursor",
  },
];

export const handlers = [
  // -------------------------------------------------------------------------
  // Auth + me
  // -------------------------------------------------------------------------
  http.get("*/v1/auth/github/start", () => {
    // The real worker 302s to GitHub; for tests we just redirect to the
    // mocked callback which sets the session cookie.
    return HttpResponse.redirect("http://localhost:3000/signin/mock-callback", 302);
  }),

  http.get("*/v1/auth/github/callback", () => {
    return new HttpResponse(null, {
      status: 302,
      headers: {
        Location: "http://localhost:3000/app",
        "Set-Cookie": `${SESSION_COOKIE}=mock-session-token; Path=/; HttpOnly; SameSite=Lax`,
      },
    });
  }),

  // Twitter OAuth — Track AC
  http.get("*/v1/auth/twitter/start", () => {
    return HttpResponse.redirect("http://localhost:3000/settings/profile?twitter=connected", 302);
  }),

  http.post("*/v1/me/twitter/disconnect", () => {
    return HttpResponse.json({ ok: true });
  }),

  http.get("*/v1/me", ({ request }) => {
    if (!hasSessionCookie(request)) {
      return HttpResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    // The /settings/profile test sets `twitter=verified` as a cookie hint to
    // flip the verified state — keeps the handlers pure & test-driven.
    const cookie = request.headers.get("cookie") ?? "";
    const verified = cookie.includes("twitter_test=verified");
    return HttpResponse.json({
      user: {
        ...USER_ME,
        twitterHandle: verified ? "ratking_x" : null,
        twitterVerified: verified,
      },
    });
  }),

  http.patch("*/v1/me", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return HttpResponse.json({ user: { ...USER_ME, ...body } });
  }),

  http.get("*/v1/me/rooms", () => {
    return HttpResponse.json({ rooms: [] });
  }),

  http.get("*/v1/me/friends", ({ request }) => {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") ?? "7d";
    return HttpResponse.json({
      range,
      friends: [
        {
          userId: USER_OTHER.id,
          handle: USER_OTHER.handle,
          avatarUrl: USER_OTHER.avatarUrl,
          twitterHandle: null,
          publicProfile: true,
          tokens: 1_500_000,
          costUsdCents: 4_200,
          sessions: 14,
          sharedRooms: [{ code: ROOM_TEST.code, name: ROOM_TEST.name }],
        },
      ],
    });
  }),

  // -------------------------------------------------------------------------
  // Trending — Track Z
  // -------------------------------------------------------------------------
  http.get("*/v1/trending", ({ request }) => {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") ?? "today";
    return HttpResponse.json({
      range,
      rows: TRENDING_ROWS,
      generatedAt: Date.now(),
    });
  }),

  // -------------------------------------------------------------------------
  // Rooms — Track Y
  // -------------------------------------------------------------------------
  http.get("*/v1/rooms/:code", ({ params }) => {
    const code = String(params.code);
    return HttpResponse.json({
      room: {
        id: "room-test",
        code,
        name: ROOM_TEST.name,
        isPublic: false,
        ownerId: USER_ME.id,
        orgId: null,
        createdAt: Date.now(),
        country: null,
      },
      members: [
        {
          userId: USER_ME.id,
          handle: USER_ME.handle,
          avatarUrl: USER_ME.avatarUrl,
          joinedAt: Date.now() - 86_400_000,
          twitterHandle: null,
        },
        {
          userId: USER_OTHER.id,
          handle: USER_OTHER.handle,
          avatarUrl: USER_OTHER.avatarUrl,
          joinedAt: Date.now() - 86_400_000,
          twitterHandle: null,
        },
      ],
    });
  }),

  http.get("*/v1/rooms/:code/leaderboard", ({ request }) => {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") ?? "today";
    return HttpResponse.json({
      leaderboard: {
        range,
        generatedAt: Date.now(),
        rows: [
          {
            rank: 1,
            userId: USER_ME.id,
            handle: USER_ME.handle,
            avatarUrl: USER_ME.avatarUrl,
            tokens: 2_500_000,
            costUsdCents: 6_200,
            sessions: 20,
            topSources: [],
            primarySource: "claude-code",
            twitterHandle: null,
          },
        ],
      },
    });
  }),

  http.get("*/v1/rooms/:code/summary", ({ request }) => {
    const url = new URL(request.url);
    const range = url.searchParams.get("range") ?? "7d";
    return HttpResponse.json({
      summary: {
        range,
        totalCostUsdCents: 9_400,
        totalTokens: 3_700_000,
        activeMembers: 2,
        dayCount: 5,
        topContributorSharePct: 65,
        modelMix: [],
        sourceMix: [],
        generatedAt: Date.now(),
      },
    });
  }),

  http.get("*/v1/rooms/:code/group-streak", () => {
    return HttpResponse.json({
      streak: {
        activeStreakDays: 5,
        longestStreakDays: 12,
        unanimousActiveStreakDays: 2,
        unanimousLongestStreakDays: 7,
      },
    });
  }),

  // Room heatmap uses /v1/heatmap?scope=room&id=...&days=...
  http.get("*/v1/heatmap", ({ request }) => {
    const url = new URL(request.url);
    const scope = (url.searchParams.get("scope") ?? "user") as "user" | "room";
    const id = url.searchParams.get("id") ?? "unknown";
    const days = Number(url.searchParams.get("days") ?? 60);
    return HttpResponse.json(makeHeatmap(scope, id, days >= 364 ? 364 : 60));
  }),

  http.get("*/v1/rooms/:code/activity", () => {
    return HttpResponse.json({ activity: [] });
  }),

  http.get("*/v1/rooms/:code/streaks", () => {
    return HttpResponse.json({ streaks: [] });
  }),

  http.get("*/v1/rooms/:code/challenges", () => {
    return HttpResponse.json({ challenges: [] });
  }),

  // -------------------------------------------------------------------------
  // Profiles — Track Y
  // -------------------------------------------------------------------------
  http.get("*/v1/u/:handle", ({ params }) => {
    return HttpResponse.json({
      profile: {
        id: USER_ME.id,
        handle: String(params.handle),
        avatarUrl: USER_ME.avatarUrl,
        bio: "Test bio",
        publicProfile: true,
        twitterHandle: null,
        twitterVerified: false,
        primarySource: "claude-code",
        totals: {
          today: { tokens: 250_000, costUsdCents: 600 },
          week: { tokens: 1_750_000, costUsdCents: 4_400 },
          allTime: { tokens: 10_000_000, costUsdCents: 25_000 },
        },
        sources: [{ source: "claude-code", tokens: 1_000_000, costUsdCents: 2_500, sessions: 12 }],
      },
    });
  }),

  http.get("*/v1/u/:handle/heatmap", ({ params, request }) => {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 60);
    return HttpResponse.json(makeHeatmap("user", String(params.handle), days >= 364 ? 364 : 60));
  }),

  http.get("*/v1/u/:handle/autobiography", ({ params }) => {
    return HttpResponse.json({
      autobiography: {
        handle: String(params.handle),
        avatarUrl: USER_ME.avatarUrl,
        totalTokens: 10_000_000,
        totalCostUsdCents: 25_000,
        monthTokens: 1_500_000,
        monthCostUsdCents: 4_200,
        biggestSessionTokens: 250_000,
        dominantModel: "claude-sonnet-4-5",
        mostActiveDayOfWeek: 2,
        sessionsPerDay: 3.4,
        totalSessions: 142,
        firstSyncDate: "2026-01-12",
        monthlyCoffees: 8.4,
      },
    });
  }),

  // -------------------------------------------------------------------------
  // Orgs — Track AA
  // -------------------------------------------------------------------------
  http.post("*/v1/orgs", async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as {
      name?: string;
      slug?: string;
      student?: boolean;
      university?: string;
    };
    return HttpResponse.json({
      org: {
        id: "org-pending",
        name: body.name ?? "Test Org",
        slug: body.slug ?? "test-org",
        plan: body.student ? "student" : "team",
        seatCount: 1,
        status: "pending",
        githubOrgLogin: null,
        createdAt: Date.now(),
      },
      waitlistPosition: 7,
    });
  }),

  http.get("*/v1/orgs/:slug", ({ params }) => {
    return HttpResponse.json({
      org: {
        id: "org-pending",
        name: "Test Org",
        slug: String(params.slug),
        plan: "team",
        seatCount: 1,
        status: "pending",
        githubOrgLogin: null,
        createdAt: Date.now(),
      },
      members: [
        {
          userId: USER_ME.id,
          handle: USER_ME.handle,
          avatarUrl: USER_ME.avatarUrl,
          role: "owner",
        },
      ],
      waitlistPosition: 7,
    });
  }),

  // -------------------------------------------------------------------------
  // Waitlists — Track AA
  // -------------------------------------------------------------------------
  http.post("*/v1/waitlists", async () => {
    return HttpResponse.json({ position: 23 });
  }),

  // -------------------------------------------------------------------------
  // Public groups — Track AE (country-filtered)
  // -------------------------------------------------------------------------
  http.get("*/v1/groups", ({ request }) => {
    // The Worker reads cf-ipcountry from the request. In tests the header
    // may arrive directly (browser-initiated fetches) or via the
    // `tr_country_test=<ISO>` cookie (server-component fetches where Next
    // forwards only cookies).
    const headerCountry = request.headers.get("cf-ipcountry");
    const cookie = request.headers.get("cookie") ?? "";
    const cookieMatch = cookie.match(/tr_country_test=([A-Z]{2})/);
    const country = headerCountry ?? cookieMatch?.[1] ?? null;
    const all = [ROOM_BR, ROOM_US];
    const groups = country ? all.filter((r) => r.country === country) : [];
    return HttpResponse.json({
      viewerCountry: country,
      groups: groups.map((g) => ({
        code: g.code,
        name: g.name,
        country: g.country,
        memberCount: g.memberCount,
      })),
    });
  }),

  // -------------------------------------------------------------------------
  // Notifications — fallback so the page doesn't 500.
  // -------------------------------------------------------------------------
  http.get("*/v1/notifications/preferences", () => {
    return HttpResponse.json({
      preferences: { weeklyDigest: true, streakReminders: true, challengeUpdates: true },
    });
  }),

  http.post("*/v1/push/test", () => {
    return HttpResponse.json({ sent: true });
  }),
];
