package serve

import (
	_ "embed"
	"net/http"
	"strings"
)

// The Model JSON editor: a CodeMirror bundle built by scripts/codemirror and
// pinned by its SHA-256. The studio loads it the first time Model JSON
// opens; artifacts never reference it.
var (
	//go:embed assets/vendor/codemirror.js
	editorJS []byte
	//go:embed assets/vendor/codemirror.js.sha256
	editorLock string
)

// MaxEditorBytes caps the editor bundle.
const MaxEditorBytes = 512 << 10

// EditorHash is the pinned SHA-256 of the editor bundle.
func EditorHash() string { return strings.Fields(editorLock)[0] }

func (s *Server) editor(w http.ResponseWriter, r *http.Request) {
	h := w.Header()
	h.Set("Content-Type", "text/javascript; charset=utf-8")
	h.Set("X-Content-Type-Options", "nosniff")
	if r.URL.Query().Get("v") == EditorHash()[:12] {
		h.Set("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		h.Set("Cache-Control", "no-cache")
	}
	_, _ = w.Write(editorJS)
}
