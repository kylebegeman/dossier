// Package store is the serve studio's data layer: a thin, hand-written
// wrapper around the sqlc querier in internal/store/db that owns connections,
// transactions, and domain types. Migrations are goose files in
// internal/store/migrations, the single schema source read by goose at open
// and by sqlc at generation. Every method that touches a document's rows
// takes the document id as its first parameter.
package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"sort"
	"strings"
	"time"

	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite" // registers the CGO-free sqlite driver

	"dossier/internal/store/db"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Store follows the two-handle SQLite discipline: exactly one writer
// connection and a small reader pool, all in WAL mode.
type Store struct {
	write  *sql.DB
	read   *sql.DB
	writeQ *db.Queries
	readQ  *db.Queries
}

// Open opens or creates the database at path and applies the migrations.
func Open(ctx context.Context, path string) (*Store, error) {
	if path == "" || strings.ContainsAny(path, "?#") {
		return nil, fmt.Errorf("store path %q must be a plain file path", path)
	}
	dsn := "file:" + path +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=busy_timeout(5000)" +
		"&_pragma=synchronous(NORMAL)" +
		"&_pragma=foreign_keys(ON)"
	write, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	write.SetMaxOpenConns(1)
	read, err := sql.Open("sqlite", dsn)
	if err != nil {
		_ = write.Close()
		return nil, err
	}
	read.SetMaxOpenConns(4)
	s := &Store{write: write, read: read, writeQ: db.New(write), readQ: db.New(read)}
	if err := s.migrate(ctx); err != nil {
		_ = s.Close()
		return nil, fmt.Errorf("migrate %s: %w", path, err)
	}
	if err := read.PingContext(ctx); err != nil {
		_ = s.Close()
		return nil, fmt.Errorf("ping readers: %w", err)
	}
	return s, nil
}

// Close releases both handles.
func (s *Store) Close() error {
	return errors.Join(s.read.Close(), s.write.Close())
}

// migrate applies the embedded migrations through a goose provider, which
// keeps no global state. Forward-only: files carry only Up sections.
func (s *Store) migrate(ctx context.Context) error {
	sub, err := fs.Sub(migrationsFS, "migrations")
	if err != nil {
		return err
	}
	p, err := goose.NewProvider(goose.DialectSQLite3, s.write, sub)
	if err != nil {
		return err
	}
	_, err = p.Up(ctx)
	return err
}

// Document returns the id of the document with slug, creating it on first use.
func (s *Store) Document(ctx context.Context, slug string) (string, error) {
	id, err := NewID()
	if err != nil {
		return "", err
	}
	now := rfc(time.Now())
	return s.writeQ.EnsureDocument(ctx, db.EnsureDocumentParams{ID: id, Slug: slug, CreatedAt: now, UpdatedAt: now})
}

// Decisions is the reader state the studio keeps for a document: the chosen
// option, picks or verdicts by item id, and notes.
type Decisions struct {
	Path     string
	Picked   []string
	Verdicts map[string]string
	Notes    map[string]string
}

// Decisions reads a document's decisions.
func (s *Store) Decisions(ctx context.Context, documentID string) (Decisions, error) {
	path, err := s.readQ.GetDecisionPath(ctx, documentID)
	if err != nil {
		return Decisions{}, err
	}
	picked, err := s.readQ.ListPicks(ctx, documentID)
	if err != nil {
		return Decisions{}, err
	}
	rows, err := s.readQ.ListNotes(ctx, documentID)
	if err != nil {
		return Decisions{}, err
	}
	verdicts, err := s.readQ.ListVerdicts(ctx, documentID)
	if err != nil {
		return Decisions{}, err
	}
	d := Decisions{Path: path, Picked: picked, Verdicts: map[string]string{}, Notes: map[string]string{}}
	for _, r := range rows {
		d.Notes[r.ItemID] = r.Body
	}
	for _, v := range verdicts {
		d.Verdicts[v.ItemID] = v.Verdict
	}
	return d, nil
}

// ReplaceDecisions stores d as the document's whole decision state in one
// transaction. Blank notes are dropped.
func (s *Store) ReplaceDecisions(ctx context.Context, documentID string, d Decisions) error {
	return s.tx(ctx, func(q *db.Queries) error {
		if err := q.SetDecisionPath(ctx, db.SetDecisionPathParams{DocumentID: documentID, DecisionPath: d.Path, UpdatedAt: rfc(time.Now())}); err != nil {
			return err
		}
		if err := q.DeletePicks(ctx, documentID); err != nil {
			return err
		}
		if err := q.DeleteNotes(ctx, documentID); err != nil {
			return err
		}
		if err := q.DeleteVerdicts(ctx, documentID); err != nil {
			return err
		}
		for _, id := range d.Picked {
			if err := q.AddPick(ctx, db.AddPickParams{DocumentID: documentID, ItemID: id}); err != nil {
				return err
			}
		}
		for _, id := range sortedKeys(d.Verdicts) {
			if v := strings.TrimSpace(d.Verdicts[id]); v != "" {
				if err := q.PutVerdict(ctx, db.PutVerdictParams{DocumentID: documentID, ItemID: id, Verdict: v}); err != nil {
					return err
				}
			}
		}
		for _, id := range sortedKeys(d.Notes) {
			body := strings.TrimSpace(d.Notes[id])
			if body == "" {
				continue
			}
			if err := q.PutNote(ctx, db.PutNoteParams{DocumentID: documentID, ItemID: id, Body: body}); err != nil {
				return err
			}
		}
		return nil
	})
}

// Draft is one unsaved edit.
type Draft struct {
	Target    string
	Base      string
	Value     string
	UpdatedAt time.Time
}

// Drafts lists a document's drafts by target.
func (s *Store) Drafts(ctx context.Context, documentID string) ([]Draft, error) {
	rows, err := s.readQ.ListDrafts(ctx, documentID)
	if err != nil {
		return nil, err
	}
	out := make([]Draft, len(rows))
	for i, r := range rows {
		out[i] = Draft{Target: r.Target, Base: r.Base, Value: r.Value, UpdatedAt: parse(r.UpdatedAt)}
	}
	return out, nil
}

// Draft reads one draft; ok is false when there is none.
func (s *Store) Draft(ctx context.Context, documentID, target string) (Draft, bool, error) {
	r, err := s.readQ.GetDraft(ctx, db.GetDraftParams{DocumentID: documentID, Target: target})
	if errors.Is(err, sql.ErrNoRows) {
		return Draft{}, false, nil
	}
	if err != nil {
		return Draft{}, false, err
	}
	return Draft{Target: r.Target, Base: r.Base, Value: r.Value, UpdatedAt: parse(r.UpdatedAt)}, true, nil
}

// PutDraft stores an edit. An existing draft keeps the base it began from.
func (s *Store) PutDraft(ctx context.Context, documentID, target, base, value string) error {
	return s.writeQ.PutDraft(ctx, db.PutDraftParams{DocumentID: documentID, Target: target, Base: base, Value: value, UpdatedAt: rfc(time.Now())})
}

// DeleteDraft removes one draft.
func (s *Store) DeleteDraft(ctx context.Context, documentID, target string) error {
	return s.writeQ.DeleteDraft(ctx, db.DeleteDraftParams{DocumentID: documentID, Target: target})
}

// DeleteDrafts removes every draft of a document.
func (s *Store) DeleteDrafts(ctx context.Context, documentID string) error {
	return s.writeQ.DeleteDrafts(ctx, documentID)
}

// Setting reads a studio preference; ok is false when it is unset.
func (s *Store) Setting(ctx context.Context, documentID, name string) (string, bool, error) {
	v, err := s.readQ.GetSetting(ctx, db.GetSettingParams{DocumentID: documentID, Name: name})
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return v, true, nil
}

// PutSetting stores a studio preference.
func (s *Store) PutSetting(ctx context.Context, documentID, name, value string) error {
	return s.writeQ.PutSetting(ctx, db.PutSettingParams{DocumentID: documentID, Name: name, Value: value, UpdatedAt: rfc(time.Now())})
}

// DeleteSetting clears a studio preference.
func (s *Store) DeleteSetting(ctx context.Context, documentID, name string) error {
	return s.writeQ.DeleteSetting(ctx, db.DeleteSettingParams{DocumentID: documentID, Name: name})
}

func (s *Store) tx(ctx context.Context, fn func(q *db.Queries) error) error {
	tx, err := s.write.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(s.writeQ.WithTx(tx)); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func sortedKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// RetargetDraft moves a draft to a new target in one transaction, keeping
// its base and value. An existing draft at the new target is replaced.
func (s *Store) RetargetDraft(ctx context.Context, documentID, from, to string) error {
	return s.tx(ctx, func(q *db.Queries) error {
		d, err := q.GetDraft(ctx, db.GetDraftParams{DocumentID: documentID, Target: from})
		if err != nil {
			return err
		}
		if err := q.DeleteDraft(ctx, db.DeleteDraftParams{DocumentID: documentID, Target: from}); err != nil {
			return err
		}
		if err := q.DeleteDraft(ctx, db.DeleteDraftParams{DocumentID: documentID, Target: to}); err != nil {
			return err
		}
		return q.PutDraft(ctx, db.PutDraftParams{DocumentID: documentID, Target: to, Base: d.Base, Value: d.Value, UpdatedAt: rfc(time.Now())})
	})
}

func rfc(t time.Time) string { return t.UTC().Format(time.RFC3339) }

func parse(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}

// NewID returns a UUIDv7: time-ordered and generated by the application.
func NewID() (string, error) {
	var b [16]byte
	ms := uint64(time.Now().UnixMilli())
	b[0] = byte(ms >> 40)
	b[1] = byte(ms >> 32)
	b[2] = byte(ms >> 24)
	b[3] = byte(ms >> 16)
	b[4] = byte(ms >> 8)
	b[5] = byte(ms)
	if _, err := rand.Read(b[6:]); err != nil {
		return "", fmt.Errorf("generate id entropy: %w", err)
	}
	b[6] = (b[6] & 0x0f) | 0x70
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16]), nil
}
