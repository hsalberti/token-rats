ALTER TABLE users ADD COLUMN publish_agent_instructions INTEGER NOT NULL DEFAULT 0 CHECK (publish_agent_instructions IN (0, 1));
ALTER TABLE users ADD COLUMN agent_workflow TEXT;
