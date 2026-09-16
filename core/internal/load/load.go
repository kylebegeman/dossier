// Package load is the one pipeline from model bytes to a checked document:
// the 0.6 alias pass, the JSON Schema, strict decoding, structure checks, the
// kind's rules, and the kind's conciseness advice. Every door and the serve
// studio read models through it, and write them back through WriteModel.
package load

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"

	"dossier/internal/kinds"
	"dossier/internal/model"
	"dossier/internal/schema"
	"dossier/internal/theme"
)

// Document is a model that passed every check.
type Document struct {
	Path string
	Doc  *model.Document
	Kind kinds.Kind
	// Warnings never block. Their paths are prefixed with Path.
	Warnings []model.Problem
	// Upgraded reports that the source was a 0.6 document rewritten by the
	// alias pass. Writing it back replaces the 0.6 source with 0.7.
	Upgraded bool
}

// Loader reads models against a kinds registry. The zero Loader knows only
// the built-in kinds.
type Loader struct {
	Kinds *kinds.Registry
}

func (l Loader) registry() *kinds.Registry {
	if l.Kinds == nil {
		return kinds.Builtin()
	}
	return l.Kinds
}

// File reads and checks one model file with the built-in kinds.
func File(path string) (*Document, []model.Problem, error) { return Loader{}.File(path) }

// Bytes checks model bytes with the built-in kinds.
func Bytes(path string, data []byte) (*Document, []model.Problem, error) {
	return Loader{}.Bytes(path, data)
}

// Check validates an in-memory document with the built-in kinds.
func Check(path string, doc *model.Document) (*Document, []model.Problem, error) {
	return Loader{}.Check(path, doc)
}

// File reads and checks one model file. Problems are findings with paths
// prefixed by the file; an error means the file could not be read or is not
// JSON at all.
func (l Loader) File(path string) (*Document, []model.Problem, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, err
	}
	return l.Bytes(path, data)
}

// Bytes checks model bytes as if they were read from path.
func (l Loader) Bytes(path string, data []byte) (*Document, []model.Problem, error) {
	data, aliasWarnings, upgraded, err := model.Normalize(data)
	if err != nil {
		return nil, nil, err
	}
	problems, err := schema.CheckModel(data)
	if err != nil {
		return nil, nil, err
	}
	if len(problems) > 0 {
		return nil, Prefix(path, problems), nil
	}
	doc, err := model.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, nil, err
	}
	if problems := model.Check(doc); len(problems) > 0 {
		return nil, Prefix(path, problems), nil
	}
	kind, err := l.registry().Load(doc.Kind)
	if err != nil {
		return nil, Prefix(path, []model.Problem{{Path: "/kind", Message: err.Error()}}), nil
	}
	kindProblems := kind.Check(doc)
	if len(kindProblems) > 0 && !upgraded {
		return nil, Prefix(path, kindProblems), nil
	}
	warnings := Prefix(path, aliasWarnings)
	if upgraded {
		// A 0.6 import is read leniently: where it does not fit the kind's
		// vocabulary, that is a warning to fix when upgrading, not a reason to
		// refuse the build. Conciseness advice waits for the upgrade too, since
		// the alias pass assembles facets from several 0.6 fields.
		for _, p := range kindProblems {
			warnings = append(warnings, model.Problem{Path: path + "#" + p.Path, Message: "0.6 import does not fit the " + kind.ID + " kind yet: " + p.Message})
		}
	} else {
		warnings = append(warnings, Prefix(path, kind.Advise(doc))...)
	}
	if doc.Meta.Theme != nil && doc.Meta.Theme.Accent != "" {
		_, advice, err := theme.Derive(doc.Meta.Theme.Accent)
		if err != nil {
			return nil, Prefix(path, []model.Problem{{Path: "/meta/theme/accent", Message: err.Error()}}), nil
		}
		for _, a := range advice {
			warnings = append(warnings, model.Problem{Path: path + "#/meta/theme/accent", Message: a})
		}
	}
	return &Document{Path: path, Doc: doc, Kind: kind, Warnings: warnings, Upgraded: upgraded}, nil, nil
}

// Check validates an in-memory document through the same pipeline, as it
// would be read back after WriteModel.
func (l Loader) Check(path string, doc *model.Document) (*Document, []model.Problem, error) {
	data, err := model.Encode(doc)
	if err != nil {
		return nil, nil, err
	}
	return l.Bytes(path, data)
}

// Prefix rewrites problem paths to file#/pointer.
func Prefix(path string, problems []model.Problem) []model.Problem {
	if len(problems) == 0 {
		return nil
	}
	out := make([]model.Problem, len(problems))
	for i, p := range problems {
		out[i] = model.Problem{Path: path + "#" + p.Path, Message: p.Message}
	}
	return out
}

// WriteModel encodes doc and replaces path atomically: a temporary file in
// the same directory, synced, then renamed over the target. A reader of path
// sees the old model or the new one, never a partial write.
func WriteModel(path string, doc *model.Document) error {
	data, err := model.Encode(doc)
	if err != nil {
		return err
	}
	return WriteFileAtomic(path, data)
}

// WriteFileAtomic replaces path with data through a temporary file and a
// rename, keeping the existing file mode when there is one.
func WriteFileAtomic(path string, data []byte) error {
	mode := os.FileMode(0o644)
	if info, err := os.Stat(path); err == nil {
		mode = info.Mode().Perm()
	}
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	name := tmp.Name()
	cleanup := func(err error) error {
		_ = tmp.Close()
		_ = os.Remove(name)
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		return cleanup(err)
	}
	if err := tmp.Chmod(mode); err != nil {
		return cleanup(err)
	}
	if err := tmp.Sync(); err != nil {
		return cleanup(err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(name)
		return err
	}
	if err := os.Rename(name, path); err != nil {
		_ = os.Remove(name)
		return fmt.Errorf("replace %s: %w", path, err)
	}
	return nil
}
