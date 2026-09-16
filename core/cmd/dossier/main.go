// Command dossier turns one JSON model into one self-contained HTML
// artifact. Every subcommand is a door from the catalog and answers one
// dossier.result/v1 envelope; pass --json to print it.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"dossier/internal/doors"
)

func main() {
	args := os.Args[1:]
	if len(args) > 0 && (args[0] == "help" || args[0] == "-h" || args[0] == "--help") {
		_, _ = fmt.Fprint(os.Stdout, doors.Usage())
		os.Exit(0)
	}
	if len(args) > 0 && (args[0] == "version" || args[0] == "--version") {
		_, _ = fmt.Fprintf(os.Stdout, "dossier %s\n", doors.Version)
		os.Exit(0)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	code := doors.Run(ctx, args, os.Stdin, os.Stdout, os.Stderr)
	stop()
	os.Exit(code)
}
