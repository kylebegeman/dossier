package gvc

import (
	"context"

	"github.com/goccy/go-graphviz/internal/wasm"
)

type Plugin interface {
	raw() *wasm.PluginAPI
}

// DefaultPlugins is empty: the module's built-in plugins lay out graphs and
// write SVG. Dossier patch: upstream added PNG and JPEG renderers in Go, which
// pulled font and image libraries into every binary.
func DefaultPlugins(ctx context.Context) ([]Plugin, error) {
	return []Plugin{}, nil
}
