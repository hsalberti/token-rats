-- Convert saved software badges into categorized favorites.
ALTER TABLE users ADD COLUMN profile_favorites TEXT NOT NULL DEFAULT '[]';
UPDATE users SET profile_favorites = (
  SELECT json_group_array(json(json_patch(
    json_object(
      'id', CASE json_extract(item.value, '$.id')
        WHEN 'codex' THEN 'software:codex-app'
        WHEN 'other' THEN 'custom:software'
        ELSE 'software:' || json_extract(item.value, '$.id') END,
      'category', 'software'
    ),
    json_object('name', json_extract(item.value, '$.name'),
                'logoUrl', json_extract(item.value, '$.logoUrl'))
  ))) FROM json_each(users.agent_software) AS item
) WHERE agent_software != '[]';
