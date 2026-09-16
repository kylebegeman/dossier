package doors

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"net"
	"os/exec"
	"runtime"
	"strconv"

	"dossier/internal/serve"
)

func init() { register("serve", serveDoor) }

// ServeResult is dossier.serve-result/v1, returned when the studio stops.
type ServeResult struct {
	SchemaVersion string `json:"schema_version"`
	URL           string `json:"url"`
	Model         string `json:"model"`
	Store         string `json:"store"`
}

func (r ServeResult) human(w io.Writer) { say(w, "studio stopped: %s\n", r.URL) }

// serveDoor runs the local studio until the context ends (Ctrl+C).
func serveDoor(ctx context.Context, in Input) Envelope {
	const id = "serve"
	fs := flag.NewFlagSet(id, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	host := fs.String("host", "127.0.0.1", "loopback host to bind")
	port := fs.Int("port", 4321, "port to bind; 0 picks a free one")
	db := fs.String("db", "", "SQLite store; default is the model's name with .db")
	open := fs.Bool("open", false, "open the studio in the default browser")
	files, err := parseInterspersed(fs, in.Args)
	if err != nil {
		return errorEnvelope(id, "usage", err)
	}
	if len(files) != 1 {
		return errorEnvelope(id, "usage", fmt.Errorf("serve needs exactly one model file"))
	}
	if *port < 0 || *port > 65535 {
		return errorEnvelope(id, "usage", fmt.Errorf("port %d is out of range", *port))
	}
	logger := slog.New(slog.NewTextHandler(in.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	srv, err := serve.New(ctx, serve.Config{Model: files[0], Store: *db, Addr: net.JoinHostPort(*host, strconv.Itoa(*port)), KindDirs: in.KindDirs, Version: Version, Logger: logger})
	if err != nil {
		return errorEnvelope(id, "start", err)
	}
	say(in.Stderr, "Dossier studio  %s\n  model  %s\n  store  %s\nCtrl+C stops it.\n", srv.URL(), files[0], srv.StorePath())
	if *open {
		if err := openBrowser(srv.URL()); err != nil {
			say(in.Stderr, "could not open a browser: %v\n", err)
		}
	}
	if err := srv.Run(ctx); err != nil {
		return errorEnvelope(id, "serve", err)
	}
	return Envelope{SchemaVersion: SchemaVersion, Command: id, Outcome: OutcomeOK,
		Result: ServeResult{SchemaVersion: "dossier.serve-result/v1", URL: srv.URL(), Model: files[0], Store: srv.StorePath()}}
}

func openBrowser(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	go func() { _ = cmd.Wait() }()
	return nil
}
