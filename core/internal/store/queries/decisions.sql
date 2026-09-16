-- name: ListPicks :many
SELECT item_id FROM picks WHERE document_id = ? ORDER BY item_id;

-- name: AddPick :exec
INSERT INTO picks (document_id, item_id) VALUES (?, ?)
ON CONFLICT (document_id, item_id) DO NOTHING;

-- name: DeletePicks :exec
DELETE FROM picks WHERE document_id = ?;

-- name: ListNotes :many
SELECT item_id, body FROM notes WHERE document_id = ? ORDER BY item_id;

-- name: PutNote :exec
INSERT INTO notes (document_id, item_id, body) VALUES (?, ?, ?)
ON CONFLICT (document_id, item_id) DO UPDATE SET body = excluded.body;

-- name: DeleteNotes :exec
DELETE FROM notes WHERE document_id = ?;
