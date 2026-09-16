// Package serve is the local studio. A loopback server renders one model
// with the studio injected, rebuilds when the file changes, and keeps the
// reader's decisions and unsaved edits in a SQLite store beside the model.
// Edits reach the model file only through the load pipeline, so the file on
// disk always validates. The studio is a deliberate JavaScript island: the
// artifact it edits is itself the page, and the server stays the authority.
package serve

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"dossier/internal/decisions"
	"dossier/internal/kinds"
	"dossier/internal/load"
	"dossier/internal/model"
	"dossier/internal/render"
	"dossier/internal/store"
)

//go:embed assets/studio.js
var studioJS string

//go:embed assets/studio.css
var studioCSS string

// Budgets for the studio island. It never ships in an artifact, but it
// stays small.
const (
	MaxStudioJSBytes  = 24 << 10
	MaxStudioCSSBytes = 10 << 10
)

const (
	defaultAddr     = "127.0.0.1:4321"
	defaultPoll     = 300 * time.Millisecond
	shutdownTimeout = 5 * time.Second
	keepAlive       = 25 * time.Second
	maxBody         = model.MaxDocumentBytes + 1<<10
)

var accentPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// Config is the studio's one configuration boundary.
type Config struct {
	// Model is the model file to serve and edit.
	Model string
	// Store is the SQLite file; default is StorePath(Model).
	Store string
	// Addr is a loopback host and port; port 0 picks a free one.
	Addr string
	// KindDirs hold custom kinds. They are checked for changes with the
	// model file and reloaded when a kind file changes.
	KindDirs []string
	// Poll is how often the model file is checked for changes.
	Poll time.Duration
	// Version names the binary in the studio.
	Version string
	Logger  *slog.Logger
}

// StorePath is the default store for a model: the same name with .db.
func StorePath(modelPath string) string {
	return strings.TrimSuffix(modelPath, filepath.Ext(modelPath)) + ".db"
}

// Server is one running studio.
type Server struct {
	cfg      Config
	log      *slog.Logger
	store    *store.Store
	token    string
	hub      *hub
	http     *http.Server
	listener net.Listener
	hosts    map[string]bool
	url      string

	writeMu sync.Mutex // serializes every write to the model file

	mu   sync.RWMutex
	snap snapshot

	idMu sync.Mutex
	ids  map[string]string // slug to store document id
}

type snapshot struct {
	mod       time.Time
	size      int64
	kinds     *kinds.Registry
	kindStamp string
	loaded    *load.Document
	findings  []model.Problem
	err       error
}

// New opens the store, binds the listener, and loads the model. Run serves.
func New(ctx context.Context, cfg Config) (*Server, error) {
	if cfg.Model == "" {
		return nil, errors.New("serve needs a model file")
	}
	info, err := os.Stat(cfg.Model)
	if err != nil {
		return nil, err
	}
	if info.IsDir() {
		return nil, fmt.Errorf("%s is a directory, not a model file", cfg.Model)
	}
	if cfg.Store == "" {
		cfg.Store = StorePath(cfg.Model)
	}
	if cfg.Addr == "" {
		cfg.Addr = defaultAddr
	}
	if cfg.Poll <= 0 {
		cfg.Poll = defaultPoll
	}
	if cfg.Logger == nil {
		cfg.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	host, port, err := net.SplitHostPort(cfg.Addr)
	if err != nil {
		return nil, fmt.Errorf("address %q: %w", cfg.Addr, err)
	}
	switch host {
	case "127.0.0.1", "::1":
	case "", "localhost":
		host = "127.0.0.1"
	default:
		return nil, fmt.Errorf("serve binds loopback only; use 127.0.0.1, ::1, or localhost, not %q", host)
	}
	if _, _, err := kinds.Open(cfg.KindDirs...); err != nil {
		return nil, err
	}
	token, err := randomToken()
	if err != nil {
		return nil, err
	}
	st, err := store.Open(ctx, cfg.Store)
	if err != nil {
		return nil, err
	}
	ln, err := net.Listen("tcp", net.JoinHostPort(host, port))
	if err != nil {
		_ = st.Close()
		return nil, err
	}
	p := strconv.Itoa(ln.Addr().(*net.TCPAddr).Port)
	s := &Server{
		cfg: cfg, log: cfg.Logger, store: st, token: token, hub: newHub(), listener: ln,
		hosts: map[string]bool{"127.0.0.1:" + p: true, "localhost:" + p: true, "[::1]:" + p: true},
		url:   "http://" + net.JoinHostPort(host, p) + "/",
		ids:   map[string]string{},
	}
	s.refresh()
	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", s.guard(false, s.page))
	mux.HandleFunc("GET /_/events", s.guard(false, s.events))
	mux.HandleFunc("GET /_/field", s.guard(true, s.getField))
	mux.HandleFunc("PUT /_/drafts", s.guard(true, s.putDraft))
	mux.HandleFunc("POST /_/drafts/commit", s.guard(true, s.commitDrafts))
	mux.HandleFunc("POST /_/drafts/discard", s.guard(true, s.discardDrafts))
	mux.HandleFunc("POST /_/move", s.guard(true, s.move))
	mux.HandleFunc("PUT /_/decisions", s.guard(true, s.putDecisions))
	mux.HandleFunc("POST /_/decisions/apply", s.guard(true, s.applyDecisions))
	mux.HandleFunc("GET /_/model", s.guard(true, s.getModel))
	mux.HandleFunc("PUT /_/model", s.guard(true, s.putModel))
	mux.HandleFunc("POST /_/validate", s.guard(true, s.validate))
	mux.HandleFunc("PUT /_/settings", s.guard(true, s.putSettings))
	s.http = &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
		ErrorLog:          slog.NewLogLogger(cfg.Logger.Handler(), slog.LevelWarn),
	}
	s.http.RegisterOnShutdown(s.hub.close)
	return s, nil
}

// URL is where the studio answers.
func (s *Server) URL() string { return s.url }

// StorePath is the SQLite file in use.
func (s *Server) StorePath() string { return s.cfg.Store }

// Run serves until ctx ends, then shuts down in order: event streams close,
// requests drain within a bound, the watcher stops, and the store closes.
func (s *Server) Run(ctx context.Context) error {
	watchCtx, stopWatch := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		s.watch(watchCtx)
	}()
	served := make(chan error, 1)
	go func() { served <- s.http.Serve(s.listener) }()

	var runErr error
	select {
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		runErr = s.http.Shutdown(shutdownCtx)
		cancel()
		if err := <-served; err != nil && !errors.Is(err, http.ErrServerClosed) && runErr == nil {
			runErr = err
		}
	case err := <-served:
		runErr = err
		s.hub.close()
	}
	stopWatch()
	wg.Wait()
	return errors.Join(runErr, s.store.Close())
}

func (s *Server) watch(ctx context.Context) {
	t := time.NewTicker(s.cfg.Poll)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if s.changed() {
				s.writeMu.Lock()
				s.refresh()
				s.writeMu.Unlock()
				s.hub.publish("reload", "file")
			}
		}
	}
}

func (s *Server) changed() bool {
	info, err := os.Stat(s.cfg.Model)
	stamp := kinds.Stamp(s.cfg.KindDirs...)
	s.mu.RLock()
	defer s.mu.RUnlock()
	if stamp != s.snap.kindStamp {
		return true
	}
	if err != nil {
		return s.snap.err == nil
	}
	return !info.ModTime().Equal(s.snap.mod) || info.Size() != s.snap.size
}

// refresh reads the kinds and the model file into the current snapshot. A
// broken kind file is a finding on the page, like a broken model.
func (s *Server) refresh() {
	next := snapshot{kindStamp: kinds.Stamp(s.cfg.KindDirs...)}
	reg, kindProblems, kindErr := kinds.Open(s.cfg.KindDirs...)
	next.kinds = reg
	if info, err := os.Stat(s.cfg.Model); err != nil {
		next.err = err
	} else {
		next.mod, next.size = info.ModTime(), info.Size()
		data, err := os.ReadFile(s.cfg.Model)
		switch {
		case err != nil:
			next.err = err
		case kindErr != nil:
			next.err = kindErr
		case len(kindProblems) > 0:
			next.findings = kindProblems
		default:
			next.loaded, next.findings, next.err = load.Loader{Kinds: reg}.Bytes(s.cfg.Model, data)
		}
	}
	switch {
	case next.err != nil:
		s.log.Warn("model unreadable", "model", s.cfg.Model, "err", next.err)
	case len(next.findings) > 0:
		s.log.Warn("model has findings", "model", s.cfg.Model, "findings", len(next.findings))
	}
	s.mu.Lock()
	s.snap = next
	s.mu.Unlock()
}

func (s *Server) current() snapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.snap
}

// loader checks models against the kinds in the current snapshot.
func (s *Server) loader() load.Loader { return load.Loader{Kinds: s.current().kinds} }

// documentID is the store's id for a slug, created on first use.
func (s *Server) documentID(ctx context.Context, slug string) (string, error) {
	s.idMu.Lock()
	defer s.idMu.Unlock()
	if id, ok := s.ids[slug]; ok {
		return id, nil
	}
	id, err := s.store.Document(ctx, slug)
	if err != nil {
		return "", err
	}
	s.ids[slug] = id
	return id, nil
}

// guard admits only same-machine, same-origin requests. The Host check
// defeats DNS rebinding; the Origin and fetch-metadata checks and the
// per-process token in a custom header defeat cross-site requests.
func (s *Server) guard(token bool, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.hosts[r.Host] {
			http.Error(w, "unknown host", http.StatusMisdirectedRequest)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host {
			http.Error(w, "cross-origin request refused", http.StatusForbidden)
			return
		}
		if token {
			if site := r.Header.Get("Sec-Fetch-Site"); site != "" && site != "same-origin" {
				http.Error(w, "cross-site request refused", http.StatusForbidden)
				return
			}
			if subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Dossier-Token")), []byte(s.token)) != 1 {
				http.Error(w, "missing or wrong studio token", http.StatusForbidden)
				return
			}
		}
		next(w, r)
	}
}

func pageHeaders(w http.ResponseWriter) {
	h := w.Header()
	h.Set("Content-Type", "text/html; charset=utf-8")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Frame-Options", "DENY")
	h.Set("Content-Security-Policy", "frame-ancestors 'none'")
}

// studioConfig is what the island reads from the page.
type studioConfig struct {
	Token     string          `json:"token"`
	Version   string          `json:"version"`
	Model     string          `json:"model"`
	Store     string          `json:"store"`
	Upgraded  bool            `json:"upgraded"`
	Drafts    []string        `json:"drafts"`
	Conflicts []string        `json:"conflicts"`
	Orders    []string        `json:"orders"`
	Warnings  []model.Problem `json:"warnings"`
	Findings  []model.Problem `json:"findings"`
	Error     string          `json:"error,omitempty"`
	Accent    string          `json:"accent,omitempty"`
}

func (s *Server) baseConfig() studioConfig {
	return studioConfig{Token: s.token, Version: s.cfg.Version, Model: s.cfg.Model, Store: s.cfg.Store,
		Drafts: []string{}, Conflicts: []string{}, Orders: []string{}, Warnings: []model.Problem{}, Findings: []model.Problem{}}
}

// page renders the model as the reader sees it, with the stored decisions
// and the drafts applied, and the studio injected.
func (s *Server) page(w http.ResponseWriter, r *http.Request) {
	snap := s.current()
	if snap.loaded == nil {
		s.findingsPage(w, r, snap)
		return
	}
	ctx := r.Context()
	cfg := s.baseConfig()
	cfg.Upgraded = snap.loaded.Upgraded
	cfg.Warnings = append(cfg.Warnings, snap.loaded.Warnings...)
	docID, err := s.documentID(ctx, snap.loaded.Doc.Meta.Slug)
	if err != nil {
		s.fail(w, err)
		return
	}
	doc, err := clone(snap.loaded.Doc)
	if err != nil {
		s.fail(w, err)
		return
	}
	drafts, err := s.store.Drafts(ctx, docID)
	if err != nil {
		s.fail(w, err)
		return
	}
	applied, conflicts := applyDrafts(doc, drafts)
	if len(applied) > 0 {
		if _, problems, err := s.loader().Check(s.cfg.Model, doc); err != nil || len(problems) > 0 {
			// The file changed under the drafts in a way they no longer fit.
			// Show the file as it is and report every draft as a conflict.
			if doc, err = clone(snap.loaded.Doc); err != nil {
				s.fail(w, err)
				return
			}
			conflicts, applied = append(conflicts, applied...), nil
			sort.Strings(conflicts)
		}
	}
	cfg.Drafts, cfg.Conflicts = nonNil(applied), nonNil(conflicts)
	for _, t := range applied {
		if strings.HasPrefix(t, "/boards/") {
			cfg.Orders = append(cfg.Orders, strings.Split(t, "/")[2])
		}
	}
	stored, err := s.store.Decisions(ctx, docID)
	if err != nil {
		s.fail(w, err)
		return
	}
	if d, ok := knownDecisions(doc, stored); ok {
		if problems := decisions.Apply(doc, d); len(problems) > 0 {
			s.log.Warn("stored decisions do not fit the model", "problems", problems)
		}
	}
	if accent, ok, err := s.store.Setting(ctx, docID, "accent"); err == nil && ok && accentPattern.MatchString(accent) {
		cfg.Accent = accent
	}
	inject, err := s.inject(cfg)
	if err != nil {
		s.fail(w, err)
		return
	}
	figures, _ := render.InlineFigures(doc, filepath.Dir(s.cfg.Model))
	html, err := render.RenderWith(doc, snap.loaded.Kind, render.Options{Figures: figures, Studio: &render.Studio{Inject: inject}})
	if err != nil {
		s.fail(w, err)
		return
	}
	pageHeaders(w)
	_, _ = w.Write(html)
}

// knownDecisions keeps the stored decisions that still name numbered items,
// with picks in item order. ok is false when nothing is stored.
func knownDecisions(doc *model.Document, stored store.Decisions) (decisions.Document, bool) {
	items := decisions.Items(doc)
	number := make(map[string]int, len(items))
	for _, it := range items {
		number[it.ID] = it.N
	}
	d := decisions.Document{Path: stored.Path, Notes: map[string]string{}}
	for _, id := range stored.Picked {
		if number[id] > 0 {
			d.Picked = append(d.Picked, id)
		}
	}
	sort.Slice(d.Picked, func(i, j int) bool { return number[d.Picked[i]] < number[d.Picked[j]] })
	for id, note := range stored.Notes {
		if number[id] > 0 {
			d.Notes[id] = note
		}
	}
	return d, d.Path != "" || len(d.Picked) > 0 || len(d.Notes) > 0
}

// findingsPage stands in for the artifact while the model does not validate.
// The studio stays live, so the model editor can fix it.
func (s *Server) findingsPage(w http.ResponseWriter, r *http.Request, snap snapshot) {
	cfg := s.baseConfig()
	message := "Fix the model file, or open Model JSON below. The page reloads when the file changes."
	if snap.err != nil {
		cfg.Error = snap.err.Error()
		message = snap.err.Error()
	}
	cfg.Findings = append(cfg.Findings, snap.findings...)
	inject, err := s.inject(cfg)
	if err != nil {
		s.fail(w, err)
		return
	}
	var buf bytes.Buffer
	view := findingsView{Title: filepath.Base(s.cfg.Model) + ": findings", Message: message, Findings: snap.findings,
		Style: "<style>\n" + render.Stylesheet() + "</style>", Inject: inject}
	if err := findingsPage(view).Render(r.Context(), &buf); err != nil {
		s.fail(w, err)
		return
	}
	pageHeaders(w)
	_, _ = w.Write(buf.Bytes())
}

type findingsView struct {
	Title    string
	Message  string
	Findings []model.Problem
	Style    string
	Inject   string
}

// inject assembles the island: its styles, the previewed accent, its
// configuration as an escaped JSON island, and its script.
func (s *Server) inject(cfg studioConfig) (string, error) {
	if strings.Contains(studioCSS, "</style") || strings.Contains(studioJS, "</script") {
		return "", errors.New("studio assets must not contain a closing style or script tag")
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(true)
	if err := enc.Encode(cfg); err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("<style>\n" + studioCSS + "</style>")
	b.WriteString(`<style id="studio-accent">`)
	if accentPattern.MatchString(cfg.Accent) {
		b.WriteString(accentCSS(cfg.Accent))
	}
	b.WriteString("</style>")
	b.WriteString(`<script type="application/json" id="dossier-studio">` + strings.TrimSpace(buf.String()) + "</script>")
	b.WriteString("<script>\n" + studioJS + "</script>")
	return b.String(), nil
}

func accentCSS(hex string) string {
	return ":root:root{--accent:" + hex + ";--accent-soft:color-mix(in srgb, " + hex + " 14%, var(--bg))}"
}

func (s *Server) fail(w http.ResponseWriter, err error) {
	s.log.Error("studio request failed", "err", err)
	http.Error(w, "studio error; see the serve log", http.StatusInternalServerError)
}

// events streams "reload", "decisions", and "settings" until the client
// leaves or the server shuts down.
func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	ch, release, ok := s.hub.subscribe()
	if !ok {
		http.Error(w, "shutting down", http.StatusServiceUnavailable)
		return
	}
	defer release()
	h := w.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	if _, err := io.WriteString(w, "retry: 1000\n: connected\n\n"); err != nil {
		return
	}
	flusher.Flush()
	tick := time.NewTicker(keepAlive)
	defer tick.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case e, open := <-ch:
			if !open {
				return
			}
			if _, err := io.WriteString(w, "event: "+e.name+"\ndata: "+e.data+"\n\n"); err != nil {
				return
			}
			flusher.Flush()
		case <-tick.C:
			if _, err := io.WriteString(w, ": keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func clone(doc *model.Document) (*model.Document, error) {
	data, err := model.Encode(doc)
	if err != nil {
		return nil, err
	}
	return model.Decode(bytes.NewReader(data))
}

func randomToken() (string, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", fmt.Errorf("studio token: %w", err)
	}
	return hex.EncodeToString(b[:]), nil
}

func nonNil(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}
