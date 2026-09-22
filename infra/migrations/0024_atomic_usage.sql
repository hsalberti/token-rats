-- Keep session writes and both rollups in the same SQLite transaction.
-- Version 2 allows one correction of counts from the new local parsers.
ALTER TABLE sessions ADD COLUMN accounting_version INTEGER NOT NULL DEFAULT 1;
CREATE TRIGGER sessions_rollup_insert AFTER INSERT ON sessions BEGIN
  INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
  VALUES (NEW.user_id, strftime('%Y-%m-%d', NEW.started_at / 1000, 'unixepoch'), NEW.in_tokens + NEW.out_tokens, NEW.cost_usd_cents, 1)
  ON CONFLICT(user_id, day) DO UPDATE SET tokens = tokens + excluded.tokens,
    cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents, sessions = sessions + 1;
  INSERT INTO daily_rollup_by_model (user_id, day, source, provider, model, in_tokens, out_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, cost_usd_cents, sessions)
  VALUES (NEW.user_id, strftime('%Y-%m-%d', NEW.started_at / 1000, 'unixepoch'), NEW.source, NEW.provider, NEW.model,
    NEW.in_tokens, NEW.out_tokens, NEW.cache_read_tokens, NEW.cache_write_tokens, NEW.reasoning_tokens, NEW.cost_usd_cents, 1)
  ON CONFLICT(user_id, day, source, provider, model) DO UPDATE SET
    in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens, cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens, cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens, reasoning_tokens = reasoning_tokens + excluded.reasoning_tokens, cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents, sessions = sessions + 1;
END;
CREATE TRIGGER sessions_rollup_update AFTER UPDATE ON sessions BEGIN
  UPDATE daily_rollup SET tokens = tokens - OLD.in_tokens - OLD.out_tokens,
    cost_usd_cents = cost_usd_cents - OLD.cost_usd_cents, sessions = sessions - 1
    WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch');
  UPDATE daily_rollup_by_model SET in_tokens = in_tokens - OLD.in_tokens, out_tokens = out_tokens - OLD.out_tokens, cache_read_tokens = cache_read_tokens - OLD.cache_read_tokens, cache_write_tokens = cache_write_tokens - OLD.cache_write_tokens, reasoning_tokens = reasoning_tokens - OLD.reasoning_tokens, cost_usd_cents = cost_usd_cents - OLD.cost_usd_cents, sessions = sessions - 1
    WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch') AND source = OLD.source
      AND provider = OLD.provider AND model = OLD.model;
  DELETE FROM daily_rollup WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch') AND sessions = 0;
  DELETE FROM daily_rollup_by_model WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch')
    AND source = OLD.source AND provider = OLD.provider AND model = OLD.model AND sessions = 0;
  INSERT INTO daily_rollup (user_id, day, tokens, cost_usd_cents, sessions)
  VALUES (NEW.user_id, strftime('%Y-%m-%d', NEW.started_at / 1000, 'unixepoch'), NEW.in_tokens + NEW.out_tokens, NEW.cost_usd_cents, 1)
  ON CONFLICT(user_id, day) DO UPDATE SET tokens = tokens + excluded.tokens,
    cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents, sessions = sessions + 1;
  INSERT INTO daily_rollup_by_model (user_id, day, source, provider, model, in_tokens, out_tokens, cache_read_tokens, cache_write_tokens, reasoning_tokens, cost_usd_cents, sessions)
  VALUES (NEW.user_id, strftime('%Y-%m-%d', NEW.started_at / 1000, 'unixepoch'), NEW.source, NEW.provider, NEW.model,
    NEW.in_tokens, NEW.out_tokens, NEW.cache_read_tokens, NEW.cache_write_tokens, NEW.reasoning_tokens, NEW.cost_usd_cents, 1)
  ON CONFLICT(user_id, day, source, provider, model) DO UPDATE SET
    in_tokens = in_tokens + excluded.in_tokens, out_tokens = out_tokens + excluded.out_tokens, cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens, cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens, reasoning_tokens = reasoning_tokens + excluded.reasoning_tokens, cost_usd_cents = cost_usd_cents + excluded.cost_usd_cents, sessions = sessions + 1;
END;
CREATE TRIGGER sessions_rollup_delete AFTER DELETE ON sessions BEGIN
  UPDATE daily_rollup SET tokens = tokens - OLD.in_tokens - OLD.out_tokens,
    cost_usd_cents = cost_usd_cents - OLD.cost_usd_cents, sessions = sessions - 1
    WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch');
  UPDATE daily_rollup_by_model SET in_tokens = in_tokens - OLD.in_tokens, out_tokens = out_tokens - OLD.out_tokens, cache_read_tokens = cache_read_tokens - OLD.cache_read_tokens, cache_write_tokens = cache_write_tokens - OLD.cache_write_tokens, reasoning_tokens = reasoning_tokens - OLD.reasoning_tokens, cost_usd_cents = cost_usd_cents - OLD.cost_usd_cents, sessions = sessions - 1
    WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch') AND source = OLD.source
      AND provider = OLD.provider AND model = OLD.model;
  DELETE FROM daily_rollup WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch') AND sessions = 0;
  DELETE FROM daily_rollup_by_model WHERE user_id = OLD.user_id AND day = strftime('%Y-%m-%d', OLD.started_at / 1000, 'unixepoch')
    AND source = OLD.source AND provider = OLD.provider AND model = OLD.model AND sessions = 0;
END;
