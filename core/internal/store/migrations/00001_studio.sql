-- +goose Up
-- The studio store. Every row belongs to one document, the tenant for every
-- query; a hosted deployment adds readers and sessions beside it.
CREATE TABLE documents (
    id            TEXT NOT NULL PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    decision_path TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
) STRICT;

-- The reader's picks and notes, by item id.
CREATE TABLE picks (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    PRIMARY KEY (document_id, item_id)
) STRICT;

CREATE TABLE notes (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    body        TEXT NOT NULL,
    PRIMARY KEY (document_id, item_id)
) STRICT;

-- Unsaved edits. target names a field by stable ids, base is the model's
-- value when the draft began, value is the edit as JSON text. A draft whose
-- base no longer matches the model is a conflict and is never applied.
CREATE TABLE drafts (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target      TEXT NOT NULL,
    base        TEXT NOT NULL,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (document_id, target)
) STRICT;

-- Studio preferences, such as the accent being previewed.
CREATE TABLE settings (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (document_id, name)
) STRICT;
