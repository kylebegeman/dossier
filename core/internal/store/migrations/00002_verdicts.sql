-- +goose Up
-- The reader's verdicts, by item id, for kinds that decide by verdict. The
-- chosen option of a document's choice stays in documents.decision_path.
CREATE TABLE verdicts (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    item_id     TEXT NOT NULL,
    verdict     TEXT NOT NULL,
    PRIMARY KEY (document_id, item_id)
) STRICT;
