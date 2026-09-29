/** SQL expressions only: never interpolate user input into these helpers. */
export function friendsSql(viewer: string, owner: string) {
  return `(${viewer}!='' AND ${viewer}!=${owner} AND (
    (EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${viewer} AND f.followed_id=${owner})
     AND EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${owner} AND f.followed_id=${viewer}))
    OR EXISTS(SELECT 1 FROM room_members mine JOIN room_members theirs ON theirs.room_id=mine.room_id
      JOIN rooms room ON room.id=mine.room_id WHERE mine.user_id=${viewer} AND theirs.user_id=${owner} AND COALESCE(room.is_public,0)=0)
  ))`;
}
export function readableSql(version = "v", owner = "u", viewer = "(SELECT id FROM viewer)") {
  return `(${owner}.id=${viewer} OR (${version}.published_at IS NOT NULL AND (
    (${version}.visibility='public' AND ${owner}.public_profile=1)
    OR (${version}.visibility='friends' AND ${friendsSql(viewer, `${owner}.id`)}))))`;
}
export function connectedSql(viewer: string, owner: string) {
  return `(${viewer}=${owner} OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=${viewer} AND f.followed_id=${owner}) OR ${friendsSql(viewer, owner)})`;
}
