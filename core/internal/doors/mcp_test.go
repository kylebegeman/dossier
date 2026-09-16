package doors

import (
	"context"
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"dossier/internal/schema"
)

// callTool invokes a tool and decodes the envelope it carries as text.
func callTool(t *testing.T, cs *mcp.ClientSession, name string, args map[string]any) (Envelope, *mcp.CallToolResult) {
	t.Helper()
	res, err := cs.CallTool(context.Background(), &mcp.CallToolParams{Name: name, Arguments: args})
	if err != nil {
		t.Fatalf("%s: %v", name, err)
	}
	if len(res.Content) != 1 {
		t.Fatalf("%s: expected one content item, got %d", name, len(res.Content))
	}
	text, ok := res.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("%s: content is not text", name)
	}
	if problems, err := schema.CheckEnvelope([]byte(text.Text)); err != nil || len(problems) > 0 {
		t.Errorf("%s: envelope violates dossier.result/v1: %v %v", name, err, problems)
	}
	var env Envelope
	if err := json.Unmarshal([]byte(text.Text), &env); err != nil {
		t.Fatalf("%s: envelope is not JSON: %v", name, err)
	}
	return env, res
}

func exerciseServer(t *testing.T, cs *mcp.ClientSession) {
	t.Helper()
	list, err := cs.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, tool := range list.Tools {
		names = append(names, tool.Name)
		if tool.Description == "" || tool.InputSchema == nil {
			t.Errorf("%s: tool needs a description and an input schema", tool.Name)
		}
	}
	if got := strings.Join(names, ","); got != "build,decisions_apply,decisions_read,describe,init,upgrade,validate" {
		t.Errorf("tools: %s", got)
	}

	env, res := callTool(t, cs, "describe", nil)
	if res.IsError || env.Outcome != OutcomeOK {
		t.Errorf("describe: %+v", env)
	}

	dir := t.TempDir()
	env, _ = callTool(t, cs, "init", map[string]any{"kind": "brainstorm", "title": "Over MCP", "out": dir})
	if env.Outcome != OutcomeOK {
		t.Fatalf("init: %+v", env)
	}
	modelPath := filepath.Join(dir, "over-mcp.dossier.json")

	env, res = callTool(t, cs, "validate", map[string]any{"files": []string{modelPath}})
	if res.IsError || env.Outcome != OutcomeOK {
		t.Errorf("validate: %+v", env)
	}

	env, res = callTool(t, cs, "build", map[string]any{"files": []string{modelPath}, "out": dir})
	if res.IsError || env.Outcome != OutcomeOK {
		t.Errorf("build: %+v", env)
	}
	if _, err := os.Stat(filepath.Join(dir, "over-mcp.html")); err != nil {
		t.Errorf("build wrote nothing: %v", err)
	}

	env, res = callTool(t, cs, "decisions_apply", map[string]any{"model": modelPath, "reply": "1. Notes: 1: yes."})
	if res.IsError || env.Outcome != OutcomeOK {
		t.Errorf("decisions_apply: %+v", env)
	}
	env, res = callTool(t, cs, "decisions_read", map[string]any{"model": modelPath})
	if res.IsError || env.Outcome != OutcomeOK || !strings.Contains(string(mustJSON(env.Result)), `"picked":["first-item"]`) {
		t.Errorf("decisions_read: %+v", env)
	}

	// A model with findings is a normal answer, not a tool error.
	broken := filepath.Join(dir, "broken.dossier.json")
	if err := os.WriteFile(broken, []byte(`{"dossier":"1.0","kind":"brainstorm","meta":{"title":"T","slug":"t"},"sections":[]}`), 0o644); err != nil {
		t.Fatal(err)
	}
	env, res = callTool(t, cs, "validate", map[string]any{"files": []string{broken}})
	if res.IsError || env.Outcome != OutcomeFindings || len(env.Findings) == 0 {
		t.Errorf("validate findings: isError=%v %+v", res.IsError, env)
	}

	// Bad arguments are a tool error with a usage envelope.
	env, res = callTool(t, cs, "build", map[string]any{"out": dir})
	if !res.IsError || env.Outcome != OutcomeError || env.Error.Code != "usage" || !strings.Contains(env.Error.Message, "files is required") {
		t.Errorf("missing files: isError=%v %+v", res.IsError, env)
	}
	env, res = callTool(t, cs, "validate", map[string]any{"files": []string{modelPath}, "bogus": 1})
	if !res.IsError || env.Error == nil || !strings.Contains(env.Error.Message, `unknown argument "bogus"`) {
		t.Errorf("unknown argument: isError=%v %+v", res.IsError, env)
	}
}

func mustJSON(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

func TestMCPInMemory(t *testing.T) {
	server, tools, err := MCPServer()
	if err != nil {
		t.Fatal(err)
	}
	if len(tools) != 7 {
		t.Errorf("expected seven tools, got %v", tools)
	}
	clientT, serverT := mcp.NewInMemoryTransports()
	ctx := context.Background()
	ss, err := server.Connect(ctx, serverT, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ss.Close() }()
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0"}, nil).Connect(ctx, clientT, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cs.Close() }()
	exerciseServer(t, cs)
}

// TestMCPOverStdio is the conformance test: the real binary, the real
// transport, a real client.
func TestMCPOverStdio(t *testing.T) {
	if testing.Short() {
		t.Skip("builds the binary")
	}
	bin := filepath.Join(t.TempDir(), "dossier")
	build := exec.Command("go", "build", "-o", bin, "../../cmd/dossier")
	build.Env = append(os.Environ(), "CGO_ENABLED=0")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("go build: %v\n%s", err, out)
	}
	ctx := context.Background()
	cs, err := mcp.NewClient(&mcp.Implementation{Name: "test", Version: "0"}, nil).Connect(ctx, &mcp.CommandTransport{Command: exec.Command(bin, "mcp")}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cs.Close() }()
	if cs.InitializeResult().ServerInfo.Name != "dossier" {
		t.Errorf("server info: %+v", cs.InitializeResult().ServerInfo)
	}
	exerciseServer(t, cs)
}

func TestCLIArgsProjection(t *testing.T) {
	c, err := LoadCatalog()
	if err != nil {
		t.Fatal(err)
	}
	var apply Command
	for _, cmd := range c.Commands {
		if cmd.ID == "decisions.apply" {
			apply = cmd
		}
	}
	args, err := cliArgs(apply, json.RawMessage(`{"model":"m.json","reply":"1, 2","out":"o.json"}`))
	if err != nil || strings.Join(args, " ") != "m.json --out o.json --reply 1, 2" {
		t.Errorf("args: %v %v", args, err)
	}
	if _, err := cliArgs(apply, json.RawMessage(`{"reply":"1"}`)); err == nil || !strings.Contains(err.Error(), "model is required") {
		t.Errorf("required: %v", err)
	}
	if _, err := cliArgs(apply, json.RawMessage(`[]`)); err == nil {
		t.Error("non-object arguments must fail")
	}
}
