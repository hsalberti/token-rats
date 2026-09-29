CREATE TABLE setups (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX one_featured_setup ON setups(user_id) WHERE featured = 1;
CREATE TABLE setup_versions (
  id TEXT PRIMARY KEY, setup_id TEXT NOT NULL REFERENCES setups(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, name TEXT NOT NULL, bundle TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '', verdict TEXT NOT NULL DEFAULT 'experiment' CHECK(verdict IN ('experiment','using','retired')),
  origin_version_id TEXT REFERENCES setup_versions(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL, published_at INTEGER,
  base_version_id TEXT,
  UNIQUE(setup_id, base_version_id),
  UNIQUE(setup_id, number)
);
CREATE INDEX setup_versions_published ON setup_versions(published_at DESC, id DESC);
CREATE INDEX setups_owner ON setups(user_id);
CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id), followed_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL, PRIMARY KEY(follower_id, followed_id), CHECK(follower_id != followed_id)
);
CREATE INDEX follows_audience ON follows(followed_id, follower_id);
CREATE TABLE setup_reviews (
  user_id TEXT NOT NULL REFERENCES users(id), version_id TEXT NOT NULL REFERENCES setup_versions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('want_to_try','trying','using','tried','dropped')),
  stars INTEGER CHECK(stars BETWEEN 1 AND 5), note TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, version_id)
);
CREATE TABLE social_prefs (
  user_id TEXT PRIMARY KEY REFERENCES users(id), setup_emails INTEGER NOT NULL DEFAULT 0,
  milestone_emails INTEGER NOT NULL DEFAULT 0, in_app INTEGER NOT NULL DEFAULT 1,
  share_milestones INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE social_notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), actor_id TEXT NOT NULL REFERENCES users(id),
  event_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('setup','milestone')),
  version_id TEXT REFERENCES setup_versions(id) ON DELETE CASCADE,
  title TEXT NOT NULL, href TEXT NOT NULL, created_at INTEGER NOT NULL, read_at INTEGER,
  email_state TEXT NOT NULL DEFAULT 'none', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, event_key)
);
CREATE INDEX social_inbox ON social_notifications(user_id, created_at DESC);
CREATE INDEX social_email_queue ON social_notifications(email_state, next_attempt_at);
CREATE TABLE monthly_milestones (
  user_id TEXT NOT NULL REFERENCES users(id), threshold INTEGER NOT NULL,
  month TEXT NOT NULL, event_id TEXT NOT NULL, achieved_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, threshold)
);
-- Existing totals establish history without sending a launch-day email burst.
INSERT INTO monthly_milestones(user_id, threshold, month, event_id, achieved_at)
SELECT totals.user_id, thresholds.threshold, MIN(totals.month), 'baseline', unixepoch() * 1000
FROM (SELECT user_id, substr(day,1,7) AS month, SUM(tokens) AS tokens FROM daily_rollup GROUP BY user_id, substr(day,1,7)) totals
CROSS JOIN (SELECT 1000000 AS threshold UNION ALL SELECT 10000000 UNION ALL SELECT 100000000) thresholds
WHERE totals.tokens >= thresholds.threshold GROUP BY totals.user_id, thresholds.threshold;

-- Import the owner's full draft privately. Preserve only the already public text in a separate shared version.
INSERT INTO setups(id, user_id, name, featured, created_at)
SELECT 'initial-' || id, id, 'My agent setup', 1, unixepoch() * 1000 FROM users
WHERE agent_instructions IS NOT NULL OR agent_workflow IS NOT NULL;
INSERT INTO setup_versions(id, setup_id, number, name, bundle, note, created_at)
SELECT 'initial-private-' || u.id, s.id, 1, s.name,
 json_object('files',json_array(json_object('name','AGENTS.md','content',COALESCE(u.agent_instructions,''))), 'workflow',COALESCE(u.agent_workflow,''),'tools','','models','','subscriptions',''),
 'Imported from my saved profile', s.created_at
FROM users u JOIN setups s ON s.user_id=u.id AND s.id='initial-' || u.id;
INSERT INTO setup_versions(id, setup_id, number, name, bundle, note, created_at, published_at)
SELECT 'initial-public-' || u.id, s.id, 2, s.name,
 json_object('files',json_array(json_object('name','AGENTS.md','content',COALESCE(u.agent_instructions,''))), 'workflow',COALESCE(u.agent_workflow,''),'tools','','models','','subscriptions',''),
 'My shared profile setup', s.created_at, s.created_at
FROM users u JOIN setups s ON s.user_id=u.id AND s.id='initial-' || u.id
WHERE u.public_profile=1 AND u.publish_agent_instructions=1;

WITH RECURSIVE lines(user_id, n, remaining, preview) AS (
 SELECT id, 0, replace(COALESCE(agent_instructions,''),char(13)||char(10),char(10))||char(10), '' FROM users WHERE public_profile=1 AND publish_agent_instructions=0 AND (agent_instructions IS NOT NULL OR agent_workflow IS NOT NULL)
 UNION ALL
 SELECT user_id,n+1,substr(remaining,instr(remaining,char(10))+1),preview||CASE WHEN n>0 THEN char(10) ELSE '' END||substr(remaining,1,instr(remaining,char(10))-1)
 FROM lines WHERE n<10 AND remaining!=''
)
INSERT INTO setup_versions(id,setup_id,number,name,bundle,note,created_at,published_at)
SELECT 'initial-public-'||u.id,s.id,2,s.name,
 json_object('files',json_array(json_object('name','AGENTS.md','content',substr(l.preview,1,4000))), 'workflow',COALESCE(u.agent_workflow,''),'tools','','models','','subscriptions',''),
 'Previously shared profile excerpt',s.created_at,s.created_at
FROM lines l JOIN users u ON u.id=l.user_id JOIN setups s ON s.id='initial-'||u.id
WHERE l.n=(SELECT MAX(n) FROM lines WHERE user_id=l.user_id);
