package graphviz

import (
	"context"
	"io"
	"io/fs"

	"github.com/goccy/go-graphviz/cgraph"
	"github.com/goccy/go-graphviz/gvc"
	"github.com/goccy/go-graphviz/internal/wasm"
)

type Graphviz struct {
	ctx    *gvc.Context
	name   string
	dir    *GraphDescriptor
	layout Layout
}

type Layout string

const (
	CIRCO     Layout = "circo"
	DOT       Layout = "dot"
	FDP       Layout = "fdp"
	NEATO     Layout = "neato"
	NOP       Layout = "nop"
	NOP1      Layout = "nop1"
	NOP2      Layout = "nop2"
	OSAGE     Layout = "osage"
	PATCHWORK Layout = "patchwork"
	SFDP      Layout = "sfdp"
	TWOPI     Layout = "twopi"
)

type Format string

const (
	XDOT Format = "dot"
	SVG  Format = "svg"
	PNG  Format = "png"
	JPG  Format = "jpg"
)

// Load compiles and starts the Graphviz module and prepares the packages that
// use it. The first call pays for it; later calls return at once. New calls
// it; call it before ParseBytes. Dossier patch: upstream did this in package
// init functions.
func Load(ctx context.Context) error {
	if err := wasm.Load(); err != nil {
		return err
	}
	if err := cgraph.Init(ctx); err != nil {
		return err
	}
	gvc.Init()
	return nil
}

// Loaded reports whether Load has compiled the module.
func Loaded() bool { return wasm.Loaded() }

func New(ctx context.Context) (*Graphviz, error) {
	if err := Load(ctx); err != nil {
		return nil, err
	}
	c, err := gvc.New(ctx)
	if err != nil {
		return nil, err
	}
	return &Graphviz{
		ctx:    c,
		dir:    cgraph.Directed,
		layout: DOT,
	}, nil
}

func NewWithPlugins(ctx context.Context, plugins ...Plugin) (*Graphviz, error) {
	if err := Load(ctx); err != nil {
		return nil, err
	}
	c, err := gvc.NewWithPlugins(ctx, plugins...)
	if err != nil {
		return nil, err
	}
	return &Graphviz{
		ctx:    c,
		dir:    cgraph.Directed,
		layout: DOT,
	}, nil
}

func (g *Graphviz) Close() error {
	return g.ctx.Close()
}

func (g *Graphviz) SetLayout(layout Layout) *Graphviz {
	g.layout = layout
	return g
}

func (g *Graphviz) Render(ctx context.Context, graph *Graph, format Format, w io.Writer) (e error) {
	defer func() {
		if err := g.ctx.FreeLayout(ctx, graph); err != nil {
			e = err
		}
	}()

	if err := g.ctx.Layout(ctx, graph, string(g.layout)); err != nil {
		return err
	}
	if err := g.ctx.RenderData(ctx, graph, string(format), w); err != nil {
		return err
	}
	return nil
}

func (g *Graphviz) RenderFilename(ctx context.Context, graph *Graph, format Format, path string) (e error) {
	defer func() {
		if err := g.ctx.FreeLayout(ctx, graph); err != nil {
			e = err
		}
	}()

	if err := g.ctx.Layout(ctx, graph, string(g.layout)); err != nil {
		return err
	}
	if err := g.ctx.RenderFilename(ctx, graph, string(format), path); err != nil {
		return err
	}
	return nil
}

func (g *Graphviz) Graph(option ...GraphOption) (*Graph, error) {
	for _, opt := range option {
		opt(g)
	}
	graph, err := cgraph.Open(g.name, g.dir, nil)
	if err != nil {
		return nil, err
	}
	return graph, nil
}

func SetFileSystem(fs fs.FS) {
	wasm.SetWasmFileSystem(fs)
}
