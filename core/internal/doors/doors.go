// Package doors is the agent surface: one catalog of commands that projects
// onto the CLI, the MCP server, and the skill, all answering one result
// envelope.
package doors

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"dossier/internal/decisions"
	"dossier/internal/kinds"
	"dossier/internal/load"
	"dossier/internal/model"
)

//go:embed catalog.json
var catalogJSON []byte

// SchemaVersion names the envelope every door returns.
const SchemaVersion = "dossier.result/v1"

// Outcomes and their exit codes.
const (
	OutcomeOK       = "ok"
	OutcomeFindings = "findings"
	OutcomeError    = "error"
)

// Catalog is the command catalog, dossier.doors/v1.
type Catalog struct {
	SchemaVersion string    `json:"schema_version"`
	Commands      []Command `json:"commands"`
}

// Command is one catalog entry.
type Command struct {
	ID         string          `json:"id"`
	Summary    string          `json:"summary"`
	Mutation   string          `json:"mutation"`
	Surfaces   []string        `json:"surfaces"`
	Positional []string        `json:"positional,omitempty"`
	Parameters json.RawMessage `json:"parameters"`
}

// Surfaced reports whether a command appears on the named surface.
func (c Command) Surfaced(surface string) bool {
	for _, s := range c.Surfaces {
		if s == surface {
			return true
		}
	}
	return false
}

// LoadCatalog decodes the embedded catalog.
func LoadCatalog() (Catalog, error) {
	var c Catalog
	dec := json.NewDecoder(bytes.NewReader(catalogJSON))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		return Catalog{}, fmt.Errorf("catalog: %w", err)
	}
	return c, nil
}

// Envelope is the one result every door returns.
type Envelope struct {
	SchemaVersion string          `json:"schema_version"`
	Command       string          `json:"command"`
	Outcome       string          `json:"outcome"`
	Result        any             `json:"result,omitempty"`
	Findings      []model.Problem `json:"findings,omitempty"`
	Warnings      []model.Problem `json:"warnings,omitempty"`
	Error         *ErrorBody      `json:"error,omitempty"`
}

// ErrorBody carries a stable code and a human message.
type ErrorBody struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// ExitCode maps an outcome to the process exit status.
func (e Envelope) ExitCode() int {
	switch e.Outcome {
	case OutcomeOK:
		return 0
	case OutcomeFindings:
		return 2
	default:
		return 1
	}
}

func errorEnvelope(command, code string, err error) Envelope {
	return Envelope{SchemaVersion: SchemaVersion, Command: command, Outcome: OutcomeError, Error: &ErrorBody{Code: code, Message: err.Error()}}
}

// Input is what a door receives: its arguments without the command name,
// stdin, and stderr for progress a long-running door reports before it
// answers. Stdout belongs to the envelope.
type Input struct {
	Args   []string
	Stdin  io.Reader
	Stderr io.Writer
	// Kinds holds the built-in kinds plus any custom kinds; nil means the
	// built-ins only.
	Kinds *kinds.Registry
	// KindDirs are the custom kind directories, for doors that run long
	// enough to reload them.
	KindDirs []string
}

func (in Input) kindRegistry() *kinds.Registry {
	if in.Kinds == nil {
		return kinds.Builtin()
	}
	return in.Kinds
}

func (in Input) loader() load.Loader { return load.Loader{Kinds: in.Kinds} }

// door is one command implementation: it parses its own flags and answers.
type door func(ctx context.Context, in Input) Envelope

var registry = map[string]door{}

func register(id string, d door) { registry[id] = d }

// reloadsKinds names the doors that outlive one call. They read the kind
// directories themselves and reload them on change, so a broken kind file
// shows up in their answers instead of stopping them from starting.
var reloadsKinds = map[string]bool{"serve": true, "mcp": true}

// KindsEnv names the environment variable listing custom kind directories.
const KindsEnv = "DOSSIER_KINDS"

// call opens the kinds registry and runs a door with it. Problems in a kind
// file are findings: a team's kinds must be valid before anything uses them.
func call(ctx context.Context, id string, d door, in Input) Envelope {
	if reloadsKinds[id] {
		return d(ctx, in)
	}
	reg, problems, err := kinds.Open(in.KindDirs...)
	if err != nil {
		return errorEnvelope(id, "kinds", err)
	}
	if len(problems) > 0 {
		return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeFindings, Findings: problems}
	}
	in.Kinds = reg
	return d(ctx, in)
}

// Run dispatches args[0] to a door, renders the envelope for humans or as
// JSON when --json is present anywhere in args, and returns the exit code.
func Run(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	// Global flags may come before the command too: dossier --kinds DIR describe.
	lead := leadingFlags(args)
	flags, args := args[:lead], args[lead:]
	if len(args) == 0 {
		say(stderr, "%s", Usage())
		return 2
	}
	id := args[0]
	if _, ok := registry[id]; !ok && len(args) > 1 {
		if _, ok := registry[id+"."+args[1]]; ok {
			id = id + "." + args[1]
			args = args[1:]
		}
	}
	d, ok := registry[id]
	if !ok {
		say(stderr, "unknown command %q\n\n%s", id, Usage())
		return 2
	}
	rest, asJSON, dirs, err := globalFlags(append(append([]string(nil), flags...), args[1:]...))
	var env Envelope
	if err != nil {
		env = errorEnvelope(id, "usage", err)
	} else {
		dirs = append(kinds.SplitDirs(os.Getenv(KindsEnv)), dirs...)
		env = call(ctx, id, d, Input{Args: rest, Stdin: stdin, Stderr: stderr, KindDirs: dirs})
	}
	if asJSON {
		enc := json.NewEncoder(stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(env); err != nil {
			sayln(stderr, err)
			return 1
		}
		return env.ExitCode()
	}
	renderHuman(env, stdout, stderr)
	return env.ExitCode()
}

// globalFlags removes the flags every command takes: --json anywhere, and
// --kinds DIR (or --kinds=DIR), which may repeat. It scans every argument
// even after a mistake, so an error still answers as JSON when asked.
func globalFlags(args []string) (rest []string, asJSON bool, dirs []string, err error) {
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "--":
			rest = append(rest, args[i:]...)
			i = len(args)
		case a == "--json":
			asJSON = true
		case a == "--kinds" || a == "-kinds":
			if i+1 >= len(args) || strings.HasPrefix(args[i+1], "-") {
				err = errors.Join(err, fmt.Errorf("--kinds needs a directory"))
				continue
			}
			dirs = append(dirs, args[i+1])
			i++
		case strings.HasPrefix(a, "--kinds=") || strings.HasPrefix(a, "-kinds="):
			dir := a[strings.Index(a, "=")+1:]
			if dir == "" {
				err = errors.Join(err, fmt.Errorf("--kinds needs a directory"))
				continue
			}
			dirs = append(dirs, dir)
		default:
			rest = append(rest, a)
		}
	}
	return rest, asJSON, dirs, err
}

// leadingFlags counts the arguments before the command that are global
// flags or their values.
func leadingFlags(args []string) int {
	i := 0
	for i < len(args) {
		switch a := args[i]; {
		case a == "--json", strings.HasPrefix(a, "--kinds="), strings.HasPrefix(a, "-kinds="):
			i++
		case (a == "--kinds" || a == "-kinds") && i+1 < len(args) && !strings.HasPrefix(args[i+1], "-"):
			i += 2
		default:
			return i
		}
	}
	return i
}

// Usage lists the catalog for the command line.
func Usage() string {
	c, err := LoadCatalog()
	if err != nil {
		return "dossier: catalog unavailable: " + err.Error() + "\n"
	}
	var b bytes.Buffer
	b.WriteString("usage: dossier <command> [flags] [--json] [--kinds DIR]\n\n")
	cmds := append([]Command(nil), c.Commands...)
	sort.Slice(cmds, func(i, j int) bool { return cmds[i].ID < cmds[j].ID })
	for _, cmd := range cmds {
		if cmd.Surfaced("cli") {
			say(&b, "  %-16s %s\n", strings.ReplaceAll(cmd.ID, ".", " "), cmd.Summary)
		}
	}
	return b.String()
}

func renderHuman(env Envelope, stdout, stderr io.Writer) {
	for _, w := range env.Warnings {
		say(stderr, "warning %s: %s\n", w.Path, w.Message)
	}
	switch env.Outcome {
	case OutcomeError:
		say(stderr, "dossier %s: %s\n", env.Command, env.Error.Message)
	case OutcomeFindings:
		for _, p := range env.Findings {
			say(stderr, "%s: %s\n", p.Path, p.Message)
		}
		say(stderr, "dossier %s: %d finding(s)\n", env.Command, len(env.Findings))
	default:
		if r, ok := env.Result.(humanResult); ok {
			r.human(stdout)
		}
	}
}

type humanResult interface {
	human(w io.Writer)
}

// parseInterspersed lets flags appear before or after positional arguments,
// so `build model.json --out dist` and `build --out dist model.json` are the
// same command. It returns the positional arguments.
func parseInterspersed(fs *flag.FlagSet, args []string) ([]string, error) {
	var positional []string
	for i := 0; i < len(args); i++ {
		a := args[i]
		if !strings.HasPrefix(a, "-") || a == "-" {
			positional = append(positional, a)
			continue
		}
		if a == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		name := strings.TrimLeft(a, "-")
		if strings.Contains(name, "=") {
			if err := fs.Parse([]string{a}); err != nil {
				return nil, err
			}
			continue
		}
		f := fs.Lookup(name)
		if f == nil {
			return nil, fmt.Errorf("flag provided but not defined: -%s", name)
		}
		if b, ok := f.Value.(interface{ IsBoolFlag() bool }); ok && b.IsBoolFlag() {
			if err := fs.Parse([]string{a}); err != nil {
				return nil, err
			}
			continue
		}
		if i+1 >= len(args) {
			return nil, fmt.Errorf("flag needs an argument: -%s", name)
		}
		if err := fs.Parse([]string{a, args[i+1]}); err != nil {
			return nil, err
		}
		i++
	}
	return positional, nil
}

// say and sayln write human output. Output failures on stdout or stderr are
// deliberately ignored; the exit code carries the outcome.
func say(w io.Writer, format string, args ...any) { _, _ = fmt.Fprintf(w, format, args...) }

func sayln(w io.Writer, args ...any) { _, _ = fmt.Fprintln(w, args...) }

func encodeDecisions(d decisions.Document) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetIndent("", "  ")
	enc.SetEscapeHTML(false)
	if err := enc.Encode(d); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
