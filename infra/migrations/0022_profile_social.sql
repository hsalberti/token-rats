-- Adds user-curated agent instructions and up to three featured GitHub projects.
-- Projects are stored as validated JSON because they are a small, ordered profile setting.
ALTER TABLE users ADD COLUMN agent_instructions TEXT;
ALTER TABLE users ADD COLUMN github_projects TEXT NOT NULL DEFAULT '[]';
