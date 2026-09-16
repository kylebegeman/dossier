// Package doors is the agent surface: one catalog of commands that projects
// onto the CLI, the MCP server, and the skill, all answering one result
// envelope.
package doors

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"sort"
	"strings"

	"dossier/internal/decisions"
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
}

// door is one command implementation: it parses its own flags and answers.
type door func(ctx context.Context, in Input) Envelope

var registry = map[string]door{}

func register(id string, d door) { registry[id] = d }

// Run dispatches args[0] to a door, renders the envelope for humans or as
// JSON when --json is present anywhere in args, and returns the exit code.
func Run(ctx context.Context, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
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
	var rest []string
	asJSON := false
	for _, a := range args[1:] {
		if a == "--json" {
			asJSON = true
			continue
		}
		rest = append(rest, a)
	}
	env := d(ctx, Input{Args: rest, Stdin: stdin, Stderr: stderr})
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

// Usage lists the catalog for the command line.
func Usage() string {
	c, err := LoadCatalog()
	if err != nil {
		return "dossier: catalog unavailable: " + err.Error() + "\n"
	}
	var b bytes.Buffer
	b.WriteString("usage: dossier <command> [flags] [--json]\n\n")
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
