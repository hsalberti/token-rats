import type { SetupVersion } from "@token-rats/contracts";
import type { Env } from "../env.js";

export const VERSION_SELECT = `SELECT v.*, s.user_id, s.featured, u.handle, u.avatar_url, u.public_profile,
 (SELECT AVG(stars) FROM setup_reviews WHERE version_id=v.id) AS average_rating,
 (SELECT COUNT(stars) FROM setup_reviews WHERE version_id=v.id) AS rating_count
 FROM setup_versions v JOIN setups s ON s.id=v.setup_id JOIN users u ON u.id=s.user_id`;
export interface VersionRow {
  id: string;
  setup_id: string;
  number: number;
  name: string;
  bundle: string;
  note: string;
  verdict: SetupVersion["verdict"];
  created_at: number;
  published_at: number | null;
  user_id: string;
  featured: number;
  handle: string;
  avatar_url: string | null;
  public_profile: number;
  average_rating: number | null;
  rating_count: number;
  origin_version_id: string | null;
}
export function serializeVersion(v: VersionRow): SetupVersion {
  return {
    id: v.id,
    setupId: v.setup_id,
    number: v.number,
    name: v.name,
    bundle: JSON.parse(v.bundle),
    note: v.note,
    verdict: v.verdict,
    createdAt: v.created_at,
    publishedAt: v.published_at,
    ownerId: v.user_id,
    featured: v.featured === 1,
    handle: v.handle,
    avatarUrl: v.avatar_url,
    averageRating: v.average_rating,
    ratingCount: v.rating_count,
    originVersionId: v.origin_version_id,
  };
}
export async function accessibleVersion(env: Env, id: string, viewer?: string) {
  return env.DB.prepare(
    `${VERSION_SELECT} WHERE v.id=? AND (s.user_id=? OR (v.published_at IS NOT NULL AND u.public_profile=1))`,
  )
    .bind(id, viewer ?? "")
    .first<VersionRow>();
}
export function notificationInsert(
  env: Env,
  args: {
    actorId: string;
    key: string;
    kind: "setup" | "milestone";
    versionId?: string;
    title: string;
    href: string;
    now: number;
    claim?: string;
  },
) {
  const preference = args.kind === "setup" ? "setup_emails" : "milestone_emails";
  // One atomic INSERT SELECT; retries cannot duplicate recipient/event pairs.
  return env.DB.prepare(`INSERT OR IGNORE INTO social_notifications
 (id,user_id,actor_id,event_key,kind,version_id,title,href,created_at,email_state)
 SELECT lower(hex(randomblob(16))),f.follower_id,?,?,?,?,?,?,?,CASE WHEN COALESCE(p.${preference},0)=1 THEN 'pending' ELSE 'none' END
 FROM follows f JOIN users a ON a.id=f.followed_id LEFT JOIN social_prefs p ON p.user_id=f.follower_id
 WHERE f.followed_id=? AND a.public_profile=1
 AND (COALESCE(p.in_app,1)=1 OR COALESCE(p.${preference},0)=1)
 ${args.claim ? "AND EXISTS(SELECT 1 FROM monthly_milestones WHERE event_id=?)" : ""}`).bind(
    args.actorId,
    args.key,
    args.kind,
    args.versionId ?? null,
    args.title,
    args.href,
    args.now,
    args.actorId,
    ...(args.claim ? [args.claim] : []),
  );
}
