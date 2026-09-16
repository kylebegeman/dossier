-- name: GetSetting :one
SELECT value FROM settings WHERE document_id = ? AND name = ?;

-- name: PutSetting :exec
INSERT INTO settings (document_id, name, value, updated_at) VALUES (?, ?, ?, ?)
ON CONFLICT (document_id, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- name: DeleteSetting :exec
DELETE FROM settings WHERE document_id = ? AND name = ?;
