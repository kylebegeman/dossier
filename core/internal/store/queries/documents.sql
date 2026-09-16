-- name: EnsureDocument :one
INSERT INTO documents (id, slug, decision_path, created_at, updated_at)
VALUES (?, ?, '', ?, ?)
ON CONFLICT (slug) DO UPDATE SET slug = excluded.slug
RETURNING id;

-- name: GetDecisionPath :one
SELECT decision_path FROM documents WHERE id = ?;

-- name: SetDecisionPath :exec
UPDATE documents SET decision_path = @decision_path, updated_at = @updated_at WHERE id = @document_id;
