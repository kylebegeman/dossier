// Command dossier-release builds and dry-runs Dossier's distribution:
//
//	go run ./cmd/dossier-release build --out dist
//	go run ./cmd/dossier-release check --out dist
//
// It never publishes. The version comes from the VERSION file.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"

	"dossier/internal/release"
)

func main() {
	if len(os.Args) < 2 || (os.Args[1] != "build" && os.Args[1] != "check") {
		_, _ = fmt.Fprintln(os.Stderr, "usage: dossier-release build|check [--out dist] [--version X.Y.Z] [--repo ..]")
		os.Exit(2)
	}
	fs := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	out := fs.String("out", "dist", "distribution directory, named dist")
	version := fs.String("version", "", "release version; default is the VERSION file")
	repo := fs.String("repo", "..", "repository root")
	_ = fs.Parse(os.Args[2:])
	if *version == "" {
		raw, err := os.ReadFile("VERSION")
		if err != nil {
			_, _ = fmt.Fprintln(os.Stderr, "dossier-release:", err)
			os.Exit(1)
		}
		*version = strings.TrimSpace(string(raw))
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	cfg := release.Config{Version: *version, Core: ".", Repo: *repo, Out: *out, Log: os.Stdout}
	var err error
	if os.Args[1] == "build" {
		err = release.Build(ctx, cfg)
	} else {
		err = release.Check(ctx, cfg)
	}
	if err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "dossier-release:", err)
		os.Exit(1)
	}
}
