package kinds

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"dossier/internal/model"
	"dossier/internal/schema"
)

// BuiltinSource is the source every embedded preset reports.
const BuiltinSource = "built-in"

// CustomSuffix is the file name ending a custom kind must use.
const CustomSuffix = ".kind.json"

// Registry holds the built-in kinds and any custom kinds loaded from
// directories. It is read-only once built and safe to share.
type Registry struct {
	kinds   map[string]Kind
	sources map[string]string
	dirs    []string
}

var builtin = sync.OnceValues(func() (*Registry, error) {
	all, err := All()
	if err != nil {
		return nil, err
	}
	r := &Registry{kinds: map[string]Kind{}, sources: map[string]string{}}
	for _, k := range all {
		r.kinds[k.ID] = k
		r.sources[k.ID] = BuiltinSource
	}
	return r, nil
})

// Builtin returns the registry of embedded presets.
func Builtin() *Registry {
	r, err := builtin()
	if err != nil {
		// The presets are embedded and tested; failing here is a build defect.
		panic(err)
	}
	return r
}

// Open loads the built-in kinds plus every custom kind in dirs. A custom kind
// is one *.kind.json file checked against the dossier.kind/v1 schema and the
// preset rules. Problems in kind files are returned as findings with paths
// like file#/pointer; a directory that cannot be read is an error.
func Open(dirs ...string) (*Registry, []model.Problem, error) {
	base := Builtin()
	r := &Registry{kinds: map[string]Kind{}, sources: map[string]string{}}
	for id, k := range base.kinds {
		r.kinds[id] = k
		r.sources[id] = BuiltinSource
	}
	var problems []model.Problem
	for _, dir := range dirs {
		if strings.TrimSpace(dir) == "" {
			continue
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			return nil, nil, fmt.Errorf("kinds directory: %w", err)
		}
		r.dirs = append(r.dirs, dir)
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), CustomSuffix) {
				continue
			}
			path := filepath.Join(dir, e.Name())
			k, found, err := parseFile(path)
			if err != nil {
				return nil, nil, err
			}
			if len(found) > 0 {
				problems = append(problems, found...)
				continue
			}
			switch source, taken := r.sources[k.ID]; {
			case taken && source == BuiltinSource:
				problems = append(problems, model.Problem{Path: path + "#/id", Message: fmt.Sprintf("kind %q is built in; custom kinds cannot shadow it", k.ID)})
			case taken:
				problems = append(problems, model.Problem{Path: path + "#/id", Message: fmt.Sprintf("kind %q is already defined in %s", k.ID, source)})
			default:
				r.kinds[k.ID] = k
				r.sources[k.ID] = path
			}
		}
	}
	return r, problems, nil
}

func parseFile(path string) (Kind, []model.Problem, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Kind{}, nil, err
	}
	prefix := func(ps []model.Problem) []model.Problem {
		out := make([]model.Problem, len(ps))
		for i, p := range ps {
			out[i] = model.Problem{Path: path + "#" + p.Path, Message: p.Message}
		}
		return out
	}
	found, err := schema.CheckKind(data)
	if err != nil {
		return Kind{}, []model.Problem{{Path: path, Message: err.Error()}}, nil
	}
	if len(found) > 0 {
		return Kind{}, prefix(found), nil
	}
	k, err := Parse(data)
	if err != nil {
		var invalid *InvalidError
		if errors.As(err, &invalid) {
			return Kind{}, prefix(invalid.Problems), nil
		}
		return Kind{}, []model.Problem{{Path: path, Message: err.Error()}}, nil
	}
	return k, nil, nil
}

// Load returns the kind with the given id.
func (r *Registry) Load(id string) (Kind, error) {
	k, ok := r.kinds[id]
	if !ok {
		return Kind{}, fmt.Errorf("unknown kind %q", id)
	}
	return k, nil
}

// All returns every kind, sorted by id.
func (r *Registry) All() []Kind {
	out := make([]Kind, 0, len(r.kinds))
	for _, k := range r.kinds {
		out = append(out, k)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ID < out[j].ID })
	return out
}

// Source names where a kind came from: built-in, or its file.
func (r *Registry) Source(id string) string { return r.sources[id] }

// Dirs lists the directories custom kinds were read from.
func (r *Registry) Dirs() []string { return append([]string(nil), r.dirs...) }

// Stamp summarizes the custom kind files in the registry's directories.
func (r *Registry) Stamp() string { return Stamp(r.dirs...) }

// Stamp summarizes the *.kind.json files in dirs by name, size, and
// modification time, so a long-running process can tell when to reload.
// Unreadable directories stamp as missing.
func Stamp(dirs ...string) string {
	var b strings.Builder
	for _, dir := range dirs {
		if strings.TrimSpace(dir) == "" {
			continue
		}
		entries, err := os.ReadDir(dir)
		if err != nil {
			fmt.Fprintf(&b, "%s:missing;", dir)
			continue
		}
		for _, e := range entries {
			if e.IsDir() || !strings.HasSuffix(e.Name(), CustomSuffix) {
				continue
			}
			if info, err := e.Info(); err == nil {
				fmt.Fprintf(&b, "%s:%d:%d;", filepath.Join(dir, e.Name()), info.Size(), info.ModTime().UnixNano())
			}
		}
	}
	return b.String()
}

// SplitDirs splits a DOSSIER_KINDS list of directories, which uses the
// platform's path list separator.
func SplitDirs(list string) []string {
	var out []string
	for _, d := range filepath.SplitList(list) {
		if strings.TrimSpace(d) != "" {
			out = append(out, d)
		}
	}
	return out
}
