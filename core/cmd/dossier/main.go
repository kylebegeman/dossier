// Command dossier turns one JSON model into one self-contained HTML
// artifact. Every subcommand is a door from the catalog and answers one
// dossier.result/v1 envelope; pass --json to print it.
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"

	"dossier/internal/doors"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	args := os.Args[1:]
	if len(args) > 0 && (args[0] == "help" || args[0] == "-h" || args[0] == "--help") {
		_, _ = fmt.Fprint(os.Stdout, doors.Usage())
		os.Exit(0)
	}
	os.Exit(doors.Run(ctx, args, os.Stdin, os.Stdout, os.Stderr))
}
