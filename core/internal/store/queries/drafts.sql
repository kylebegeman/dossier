-- name: ListDrafts :many
SELECT target, base, value, updated_at FROM drafts WHERE document_id = ? ORDER BY target;

-- name: GetDraft :one
SELECT target, base, value, updated_at FROM drafts WHERE document_id = ? AND target = ?;

-- name: PutDraft :exec
INSERT INTO drafts (document_id, target, base, value, updated_at) VALUES (?, ?, ?, ?, ?)
ON CONFLICT (document_id, target) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

-- name: DeleteDraft :exec
DELETE FROM drafts WHERE document_id = ? AND target = ?;

-- name: DeleteDrafts :exec
DELETE FROM drafts WHERE document_id = ?;
