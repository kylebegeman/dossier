package doors

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"

	"dossier/internal/kinds"
)

func init() { register("mcp", mcpDoor) }

// Version is the binary's version. Release builds set it with
// -ldflags "-X dossier/internal/doors.Version=0.7.2".
var Version = "0.7.2-dev"

// MCPResult is dossier.mcp-result/v1, returned when the server stops.
type MCPResult struct {
	SchemaVersion string   `json:"schema_version"`
	Tools         []string `json:"tools"`
}

func (r MCPResult) human(w io.Writer) {
	say(w, "served %d tools: %s\n", len(r.Tools), strings.Join(r.Tools, ", "))
}

// mcpDoor serves every mcp-surfaced door as a tool over stdio until the
// client closes the stream.
func mcpDoor(ctx context.Context, in Input) Envelope {
	args := in.Args
	const id = "mcp"
	if len(args) > 0 {
		return errorEnvelope(id, "usage", fmt.Errorf("mcp takes no arguments"))
	}
	// A missing kinds directory stops the server from starting; a broken kind
	// file does not, since every tool call reads the directories again and
	// answers with the problems until they are fixed.
	if _, _, err := kinds.Open(in.KindDirs...); err != nil {
		return errorEnvelope(id, "kinds", err)
	}
	server, tools, err := MCPServer(in.KindDirs...)
	if err != nil {
		return errorEnvelope(id, "catalog", err)
	}
	if err := server.Run(ctx, &mcp.StdioTransport{}); err != nil && ctx.Err() == nil {
		return errorEnvelope(id, "transport", err)
	}
	return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeOK, Result: MCPResult{SchemaVersion: "dossier.mcp-result/v1", Tools: tools}}
}

// MCPServer builds the server from the catalog: one tool per mcp-surfaced
// command, its input schema the command's parameters, its result the same
// envelope the CLI prints. Each call reads the custom kinds in kindDirs, so
// edits to a kind file apply without restarting the server.
func MCPServer(kindDirs ...string) (*mcp.Server, []string, error) {
	catalog, err := LoadCatalog()
	if err != nil {
		return nil, nil, err
	}
	server := mcp.NewServer(&mcp.Implementation{Name: "dossier", Version: Version}, &mcp.ServerOptions{
		Instructions: "Dossier turns one JSON model into one self-contained HTML artifact. Call describe first for the kinds and their facet vocabularies, init to start a model, validate and build to check and render it, and the decisions tools to read or apply a reader's picks. Every tool answers a dossier.result/v1 envelope as JSON text.",
	})
	var names []string
	for _, cmd := range catalog.Commands {
		if !cmd.Surfaced("mcp") {
			continue
		}
		d, ok := registry[cmd.ID]
		if !ok {
			return nil, nil, fmt.Errorf("catalog command %q has no door", cmd.ID)
		}
		cmd := cmd
		name := ToolName(cmd.ID)
		names = append(names, name)
		server.AddTool(&mcp.Tool{Name: name, Description: cmd.Summary, InputSchema: json.RawMessage(cmd.Parameters)}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			args, err := cliArgs(cmd, req.Params.Arguments)
			if err != nil {
				return toolResult(errorEnvelope(cmd.ID, "usage", err))
			}
			return toolResult(call(ctx, cmd.ID, d, Input{Args: args, Stdin: strings.NewReader(""), Stderr: io.Discard, KindDirs: kindDirs}))
		})
	}
	sort.Strings(names)
	return server, names, nil
}

// ToolName is the MCP tool name for a command id: dots become underscores.
func ToolName(id string) string { return strings.ReplaceAll(id, ".", "_") }

// cliArgs projects tool arguments onto the door's command line: positional
// parameters in catalog order, then flags in a stable order.
func cliArgs(cmd Command, raw json.RawMessage) ([]string, error) {
	values := map[string]any{}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &values); err != nil {
			return nil, fmt.Errorf("arguments must be a JSON object: %w", err)
		}
	}
	var params struct {
		Required   []string                   `json:"required"`
		Properties map[string]json.RawMessage `json:"properties"`
	}
	if err := json.Unmarshal(cmd.Parameters, &params); err != nil {
		return nil, err
	}
	for _, r := range params.Required {
		if _, ok := values[r]; !ok {
			return nil, fmt.Errorf("%s is required", r)
		}
	}
	positional := map[string]bool{}
	var args []string
	for _, p := range cmd.Positional {
		positional[p] = true
		if v, ok := values[p]; ok {
			strs, err := stringsOf(p, v)
			if err != nil {
				return nil, err
			}
			args = append(args, strs...)
		}
	}
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if positional[k] {
			continue
		}
		if _, known := params.Properties[k]; !known {
			return nil, fmt.Errorf("unknown argument %q", k)
		}
		switch v := values[k].(type) {
		case bool:
			if v {
				args = append(args, "--"+k)
			}
		case string:
			args = append(args, "--"+k, v)
		case float64:
			args = append(args, "--"+k, strconv.FormatFloat(v, 'f', -1, 64))
		default:
			return nil, fmt.Errorf("argument %q must be a string, number, or boolean", k)
		}
	}
	return args, nil
}

func stringsOf(name string, v any) ([]string, error) {
	switch x := v.(type) {
	case string:
		return []string{x}, nil
	case []any:
		var out []string
		for _, e := range x {
			s, ok := e.(string)
			if !ok {
				return nil, fmt.Errorf("%s must hold strings", name)
			}
			out = append(out, s)
		}
		return out, nil
	}
	return nil, fmt.Errorf("%s must be a string or an array of strings", name)
}

// toolResult carries the envelope as JSON text. Only an error outcome marks
// the call as failed; findings are a normal answer the agent should read.
func toolResult(env Envelope) (*mcp.CallToolResult, error) {
	data, err := json.MarshalIndent(env, "", "  ")
	if err != nil {
		return nil, err
	}
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(data)}}, IsError: env.Outcome == OutcomeError}, nil
}
