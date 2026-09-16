package serve

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"dossier/internal/decisions"
	"dossier/internal/kinds"
	"dossier/internal/load"
	"dossier/internal/model"
	"dossier/internal/store"
	"dossier/internal/theme"
)

// response is the one JSON shape the studio API answers with.
type response struct {
	OK        bool            `json:"ok"`
	Error     string          `json:"error,omitempty"`
	Outcome   string          `json:"outcome,omitempty"`
	Findings  []model.Problem `json:"findings,omitempty"`
	Warnings  []model.Problem `json:"warnings,omitempty"`
	Written   string          `json:"written,omitempty"`
	Applied   []string        `json:"applied,omitempty"`
	Conflicts []string        `json:"conflicts,omitempty"`
	Reverted  bool            `json:"reverted,omitempty"`
	Target    string          `json:"target,omitempty"`
	Value     *string         `json:"value,omitempty"`
	Multiline bool            `json:"multiline,omitempty"`
	Draft     bool            `json:"draft,omitempty"`
	Conflict  bool            `json:"conflict,omitempty"`
	Reply     string          `json:"reply,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v response) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func problem(w http.ResponseWriter, status int, format string, args ...any) {
	writeJSON(w, status, response{Error: fmt.Sprintf(format, args...)})
}

func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBody))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		problem(w, http.StatusBadRequest, "request body: %v", err)
		return false
	}
	return true
}

func readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		problem(w, http.StatusRequestEntityTooLarge, "request body: %v", err)
		return nil, false
	}
	return data, true
}

// clientID names the tab that made a change, so it does not reload itself.
func clientID(r *http.Request) string {
	id := r.Header.Get("X-Dossier-Client")
	if len(id) > 32 {
		return ""
	}
	for _, c := range id {
		if (c < 'a' || c > 'z') && (c < '0' || c > '9') {
			return ""
		}
	}
	return id
}

// ready answers 409 unless the model on disk validates.
func (s *Server) ready(w http.ResponseWriter, r *http.Request) (*load.Document, string, bool) {
	snap := s.current()
	if snap.loaded == nil {
		msg := "the model does not validate; fix it first"
		if snap.err != nil {
			msg = snap.err.Error()
		}
		writeJSON(w, http.StatusConflict, response{Error: msg, Findings: snap.findings})
		return nil, "", false
	}
	id, err := s.documentID(r.Context(), snap.loaded.Doc.Meta.Slug)
	if err != nil {
		s.fail(w, err)
		return nil, "", false
	}
	return snap.loaded, id, true
}

// editable answers 409 for a 0.6 document: writing it would replace the 0.6
// source, which only dossier upgrade does, on purpose.
func (s *Server) editable(w http.ResponseWriter, l *load.Document) bool {
	if l.Upgraded {
		problem(w, http.StatusConflict, "%s is a 0.6 document; run dossier upgrade %s to edit it in the studio", filepath.Base(s.cfg.Model), s.cfg.Model)
		return false
	}
	return true
}

func (s *Server) getField(w http.ResponseWriter, r *http.Request) {
	l, docID, ok := s.ready(w, r)
	if !ok {
		return
	}
	target := r.URL.Query().Get("target")
	doc, err := s.shaped(r.Context(), docID, l)
	if err != nil {
		s.fail(w, err)
		return
	}
	f, err := resolve(doc, l.Kind, target)
	if err != nil || f.board != nil || f.facets != nil {
		problem(w, http.StatusBadRequest, "%q is not an editable text field", target)
		return
	}
	var value string
	_ = json.Unmarshal([]byte(f.value()), &value)
	res := response{OK: true, Target: target, Value: &value, Multiline: f.multiline}
	d, found, err := s.store.Draft(r.Context(), docID, target)
	if err != nil {
		s.fail(w, err)
		return
	}
	if found {
		var drafted string
		if json.Unmarshal([]byte(d.Value), &drafted) == nil {
			res.Value, res.Draft, res.Conflict = &drafted, true, d.Base != f.value()
		}
	}
	writeJSON(w, http.StatusOK, res)
}

type draftRequest struct {
	Target string `json:"target"`
	Value  string `json:"value"`
}

// putDraft stores an edit. An edit back to the file's value removes the
// draft; an edit that would make the model invalid is refused with findings.
func (s *Server) putDraft(w http.ResponseWriter, r *http.Request) {
	var req draftRequest
	if !decodeBody(w, r, &req) {
		return
	}
	l, docID, ok := s.ready(w, r)
	if !ok || !s.editable(w, l) {
		return
	}
	ctx := r.Context()
	shaped, err := s.shaped(ctx, docID, l)
	if err != nil {
		s.fail(w, err)
		return
	}
	f, err := resolve(shaped, l.Kind, req.Target)
	if err != nil || f.board != nil || f.facets != nil {
		problem(w, http.StatusBadRequest, "%q is not an editable text field", req.Target)
		return
	}
	base := f.value()
	value := jsonText(normalize(req.Value, f.multiline))
	existing, found, err := s.store.Draft(ctx, docID, req.Target)
	if err != nil {
		s.fail(w, err)
		return
	}
	if value == base {
		if found {
			if err := s.store.DeleteDraft(ctx, docID, req.Target); err != nil {
				s.fail(w, err)
				return
			}
			s.hub.publish("reload", "drafts")
		}
		writeJSON(w, http.StatusOK, response{OK: true, Target: req.Target, Reverted: true})
		return
	}
	drafts, err := s.store.Drafts(ctx, docID)
	if err != nil {
		s.fail(w, err)
		return
	}
	next := store.Draft{Target: req.Target, Base: base, Value: value}
	replaced := false
	for i := range drafts {
		if drafts[i].Target == req.Target {
			drafts[i], replaced = next, true
		}
	}
	if !replaced {
		drafts = append(drafts, next)
	}
	sortDrafts(drafts)
	candidate, err := clone(l.Doc)
	if err != nil {
		s.fail(w, err)
		return
	}
	applyDrafts(candidate, l.Kind, drafts)
	if _, problems, err := s.loader().Check(s.cfg.Model, candidate); err != nil || len(problems) > 0 {
		if err != nil {
			problem(w, http.StatusUnprocessableEntity, "%v", err)
			return
		}
		writeJSON(w, http.StatusUnprocessableEntity, response{Error: "this edit would make the model invalid", Findings: problems})
		return
	}
	// A draft that began from an older file value restarts from this one.
	if found && existing.Base != base {
		if err := s.store.DeleteDraft(ctx, docID, req.Target); err != nil {
			s.fail(w, err)
			return
		}
	}
	if err := s.store.PutDraft(ctx, docID, req.Target, base, value); err != nil {
		s.fail(w, err)
		return
	}
	s.hub.publish("reload", "drafts")
	writeJSON(w, http.StatusOK, response{OK: true, Target: req.Target})
}

// shaped is the file's document with the structural drafts applied, after
// moving any draft saved before facets had stable targets.
func (s *Server) shaped(ctx context.Context, docID string, l *load.Document) (*model.Document, error) {
	if err := s.migrateDrafts(ctx, docID, l.Doc); err != nil {
		return nil, err
	}
	doc, err := clone(l.Doc)
	if err != nil {
		return nil, err
	}
	drafts, err := s.store.Drafts(ctx, docID)
	if err != nil {
		return nil, err
	}
	withStructure(doc, l.Kind, drafts)
	return doc, nil
}

var indexedFacet = regexp.MustCompile(`^/items/([^/]+)/facets/([0-9]+)/markdown$`)

// migrateDrafts moves drafts that named a facet by its position, from before
// facets had stable targets, to the facet's slug while their base still
// matches the file. A draft whose base no longer matches stays a conflict.
func (s *Server) migrateDrafts(ctx context.Context, docID string, doc *model.Document) error {
	drafts, err := s.store.Drafts(ctx, docID)
	if err != nil {
		return err
	}
	for _, d := range drafts {
		m := indexedFacet.FindStringSubmatch(d.Target)
		if m == nil {
			continue
		}
		it := findItem(doc, m[1])
		i, _ := strconv.Atoi(m[2])
		if it == nil || i >= len(it.Facets) || jsonText(it.Facets[i].Markdown) != d.Base {
			continue
		}
		if err := s.store.RetargetDraft(ctx, docID, d.Target, "/items/"+m[1]+"/facets/"+kinds.Slug(it.Facets[i].Label)+"/markdown"); err != nil {
			return err
		}
	}
	return nil
}

func sortDrafts(d []store.Draft) {
	for i := 1; i < len(d); i++ {
		for j := i; j > 0 && d[j].Target < d[j-1].Target; j-- {
			d[j], d[j-1] = d[j-1], d[j]
		}
	}
}

type moveRequest struct {
	Item      string `json:"item"`
	Direction string `json:"direction"`
}

// move drafts a new order for the board holding the item.
func (s *Server) move(w http.ResponseWriter, r *http.Request) {
	var req moveRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.Direction != "up" && req.Direction != "down" {
		problem(w, http.StatusBadRequest, "direction must be up or down")
		return
	}
	l, docID, ok := s.ready(w, r)
	if !ok || !s.editable(w, l) {
		return
	}
	ctx := r.Context()
	sec := sectionOf(l.Doc, req.Item)
	if sec == nil {
		problem(w, http.StatusNotFound, "no board holds item %q", req.Item)
		return
	}
	target := "/boards/" + sec.ID + "/order"
	base := jsonText(boardIDs(sec.Board))
	order := boardIDs(sec.Board)
	existing, found, err := s.store.Draft(ctx, docID, target)
	if err != nil {
		s.fail(w, err)
		return
	}
	if found && existing.Base == base {
		var drafted []string
		if json.Unmarshal([]byte(existing.Value), &drafted) == nil && len(drafted) == len(order) {
			order = drafted
		}
	}
	at := -1
	for i, id := range order {
		if id == req.Item {
			at = i
		}
	}
	to := at - 1
	if req.Direction == "down" {
		to = at + 1
	}
	if at < 0 || to < 0 || to >= len(order) {
		writeJSON(w, http.StatusOK, response{OK: true, Target: target})
		return
	}
	order[at], order[to] = order[to], order[at]
	value := jsonText(order)
	if found {
		if err := s.store.DeleteDraft(ctx, docID, target); err != nil {
			s.fail(w, err)
			return
		}
	}
	if value != base {
		if err := s.store.PutDraft(ctx, docID, target, base, value); err != nil {
			s.fail(w, err)
			return
		}
	}
	s.hub.publish("reload", "drafts")
	writeJSON(w, http.StatusOK, response{OK: true, Target: target, Reverted: value == base})
}

// commitDrafts writes every draft that still fits the file into the model,
// through the load pipeline, and keeps the conflicts as drafts.
func (s *Server) commitDrafts(w http.ResponseWriter, r *http.Request) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	l, docID, ok := s.ready(w, r)
	if !ok || !s.editable(w, l) {
		return
	}
	ctx := r.Context()
	fresh, problems, err := s.loader().File(s.cfg.Model)
	if err != nil || len(problems) > 0 {
		writeJSON(w, http.StatusConflict, response{Error: "the model file changed and does not validate", Findings: problems})
		return
	}
	drafts, err := s.store.Drafts(ctx, docID)
	if err != nil {
		s.fail(w, err)
		return
	}
	doc := fresh.Doc
	applied, conflicts := applyDrafts(doc, fresh.Kind, drafts)
	if len(applied) == 0 {
		writeJSON(w, http.StatusOK, response{OK: true, Conflicts: conflicts})
		return
	}
	if _, problems, err := s.loader().Check(s.cfg.Model, doc); err != nil || len(problems) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, response{Error: "the drafts together make the model invalid", Findings: problems, Conflicts: conflicts})
		return
	}
	if err := load.WriteModel(s.cfg.Model, doc); err != nil {
		s.fail(w, err)
		return
	}
	for _, t := range applied {
		if err := s.store.DeleteDraft(ctx, docID, t); err != nil {
			s.fail(w, err)
			return
		}
	}
	s.refresh()
	s.hub.publish("reload", "commit")
	writeJSON(w, http.StatusOK, response{OK: true, Written: s.cfg.Model, Applied: applied, Conflicts: conflicts})
}

func (s *Server) discardDrafts(w http.ResponseWriter, r *http.Request) {
	_, docID, ok := s.ready(w, r)
	if !ok {
		return
	}
	if err := s.store.DeleteDrafts(r.Context(), docID); err != nil {
		s.fail(w, err)
		return
	}
	s.hub.publish("reload", "drafts")
	writeJSON(w, http.StatusOK, response{OK: true})
}

type decisionsRequest struct {
	Path     string            `json:"path"`
	Picked   []string          `json:"picked"`
	Verdicts map[string]string `json:"verdicts"`
	Notes    map[string]string `json:"notes"`
}

// putDecisions stores the reader's state. Ids the model does not number are
// dropped rather than refused, since the file may have changed mid-flight.
func (s *Server) putDecisions(w http.ResponseWriter, r *http.Request) {
	var req decisionsRequest
	if !decodeBody(w, r, &req) {
		return
	}
	l, docID, ok := s.ready(w, r)
	if !ok {
		return
	}
	d, _ := knownDecisions(l.Doc, store.Decisions{Path: strings.TrimSpace(req.Path), Picked: req.Picked, Verdicts: req.Verdicts, Notes: req.Notes}, l.Kind.Rules(l.Doc))
	if err := s.store.ReplaceDecisions(r.Context(), docID, store.Decisions{Path: d.Path, Picked: d.Picked, Verdicts: d.Verdicts, Notes: d.Notes}); err != nil {
		s.fail(w, err)
		return
	}
	s.hub.publish("decisions", clientID(r))
	writeJSON(w, http.StatusOK, response{OK: true})
}

// importDecisions stores a reply line or a decisions document someone sent
// back, in place of the stored decisions, when it fits the model's kind.
func (s *Server) importDecisions(w http.ResponseWriter, r *http.Request) {
	data, ok := readBody(w, r)
	if !ok {
		return
	}
	l, docID, ok := s.ready(w, r)
	if !ok {
		return
	}
	rules := l.Kind.Rules(l.Doc)
	if rules.Mode == decisions.ModeNone {
		problem(w, http.StatusUnprocessableEntity, "the %s kind has nothing to decide", l.Kind.ID)
		return
	}
	text := strings.TrimSpace(string(data))
	var d decisions.Document
	var err error
	if strings.HasPrefix(text, "{") || strings.Contains(text, "```json") {
		d, err = decisions.Parse(data)
	} else {
		d, err = decisions.ParseReply(strings.TrimPrefix(text, "Reply: "), decisions.Items(l.Doc, rules), rules)
	}
	if err != nil {
		problem(w, http.StatusUnprocessableEntity, "%v", err)
		return
	}
	doc, err := clone(l.Doc)
	if err != nil {
		s.fail(w, err)
		return
	}
	if problems := decisions.Apply(doc, d, rules); len(problems) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, response{Error: "the decisions do not fit the model", Findings: problems})
		return
	}
	stored := store.Decisions{}
	if doc.Decisions != nil {
		stored = store.Decisions{Path: doc.Decisions.Path, Picked: doc.Decisions.Picked, Verdicts: doc.Decisions.Verdicts, Notes: doc.Decisions.Notes}
	}
	if err := s.store.ReplaceDecisions(r.Context(), docID, stored); err != nil {
		s.fail(w, err)
		return
	}
	s.hub.publish("decisions", "")
	writeJSON(w, http.StatusOK, response{OK: true, Reply: decisions.FromModel(doc, rules).Reply})
}

type facetRequest struct {
	Item   string `json:"item"`
	Label  string `json:"label"`
	Remove bool   `json:"remove"`
}

// editFacets drafts adding or removing one facet of an item. A new facet
// takes its place in the kind's order and starts from the kind's hint; a
// required facet cannot be removed.
func (s *Server) editFacets(w http.ResponseWriter, r *http.Request) {
	var req facetRequest
	if !decodeBody(w, r, &req) {
		return
	}
	l, docID, ok := s.ready(w, r)
	if !ok || !s.editable(w, l) {
		return
	}
	ctx := r.Context()
	rule, ok := l.Kind.FacetRule(req.Label)
	if !ok {
		problem(w, http.StatusBadRequest, "%q is not a facet of the %s kind", req.Label, l.Kind.ID)
		return
	}
	if req.Remove && rule.Required {
		problem(w, http.StatusUnprocessableEntity, "every %s needs %q, so it cannot be removed", l.Kind.Item.Noun, rule.Label)
		return
	}
	shaped, err := s.shaped(ctx, docID, l)
	if err != nil {
		s.fail(w, err)
		return
	}
	item := findItem(shaped, req.Item)
	onDisk := findItem(l.Doc, req.Item)
	if item == nil || onDisk == nil {
		problem(w, http.StatusNotFound, "no item %q", req.Item)
		return
	}
	if sec := sectionOf(l.Doc, req.Item); sec.Board.Layout == "rows" {
		problem(w, http.StatusBadRequest, "%s is a rows entry, whose facets are free-form; edit them in Model JSON", req.Item)
		return
	}
	var labels []string
	present := false
	for _, f := range l.Kind.Facets {
		has := false
		for _, label := range facetLabels(item) {
			has = has || kinds.Slug(label) == kinds.Slug(f.Label)
		}
		present = present || (has && kinds.Slug(f.Label) == kinds.Slug(rule.Label))
		switch {
		case kinds.Slug(f.Label) == kinds.Slug(rule.Label) && !req.Remove:
			labels = append(labels, labelAsWritten(item, f.Label))
		case kinds.Slug(f.Label) == kinds.Slug(rule.Label):
		case has:
			labels = append(labels, labelAsWritten(item, f.Label))
		}
	}
	if present != req.Remove {
		verb := "already has"
		if req.Remove {
			verb = "has no"
		}
		problem(w, http.StatusConflict, "%s %s %q", req.Item, verb, rule.Label)
		return
	}
	target := "/items/" + req.Item + "/facets"
	base, value := jsonText(facetLabels(onDisk)), jsonText(labels)
	drafts, err := s.store.Drafts(ctx, docID)
	if err != nil {
		s.fail(w, err)
		return
	}
	next := store.Draft{Target: target, Base: base, Value: value}
	kept := drafts[:0]
	for _, d := range drafts {
		if d.Target == target {
			next.Base = d.Base
			continue
		}
		// Removing a facet drops the drafts of its text.
		if req.Remove && d.Target == target+"/"+kinds.Slug(rule.Label)+"/markdown" {
			continue
		}
		kept = append(kept, d)
	}
	candidate, err := clone(l.Doc)
	if err != nil {
		s.fail(w, err)
		return
	}
	applyDrafts(candidate, l.Kind, append(kept, next))
	if _, problems, err := s.loader().Check(s.cfg.Model, candidate); err != nil || len(problems) > 0 {
		if err != nil {
			problem(w, http.StatusUnprocessableEntity, "%v", err)
			return
		}
		writeJSON(w, http.StatusUnprocessableEntity, response{Error: "this change would make the model invalid", Findings: problems})
		return
	}
	if req.Remove {
		if err := s.store.DeleteDraft(ctx, docID, target+"/"+kinds.Slug(rule.Label)+"/markdown"); err != nil {
			s.fail(w, err)
			return
		}
	}
	if err := s.store.DeleteDraft(ctx, docID, target); err != nil {
		s.fail(w, err)
		return
	}
	if value != next.Base {
		if err := s.store.PutDraft(ctx, docID, target, next.Base, value); err != nil {
			s.fail(w, err)
			return
		}
	}
	s.hub.publish("reload", "drafts")
	res := response{OK: true, Target: target, Reverted: value == next.Base}
	if !req.Remove {
		res.Target = target + "/" + kinds.Slug(rule.Label) + "/markdown"
	}
	writeJSON(w, http.StatusOK, res)
}

// labelAsWritten keeps an item's own spelling of a facet label it has, and
// uses the kind's spelling for one it does not.
func labelAsWritten(it *model.Item, label string) string {
	for _, f := range it.Facets {
		if kinds.Slug(f.Label) == kinds.Slug(label) {
			return f.Label
		}
	}
	return label
}

// applyDecisions writes the stored decisions into the model file.
func (s *Server) applyDecisions(w http.ResponseWriter, r *http.Request) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	l, docID, ok := s.ready(w, r)
	if !ok || !s.editable(w, l) {
		return
	}
	ctx := r.Context()
	fresh, problems, err := s.loader().File(s.cfg.Model)
	if err != nil || len(problems) > 0 {
		writeJSON(w, http.StatusConflict, response{Error: "the model file changed and does not validate", Findings: problems})
		return
	}
	stored, err := s.store.Decisions(ctx, docID)
	if err != nil {
		s.fail(w, err)
		return
	}
	rules := fresh.Kind.Rules(fresh.Doc)
	d, _ := knownDecisions(fresh.Doc, stored, rules)
	if problems := decisions.Apply(fresh.Doc, d, rules); len(problems) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, response{Error: "the decisions do not fit the model", Findings: problems})
		return
	}
	if _, problems, err := s.loader().Check(s.cfg.Model, fresh.Doc); err != nil || len(problems) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, response{Error: "the decided model does not validate", Findings: problems})
		return
	}
	if err := load.WriteModel(s.cfg.Model, fresh.Doc); err != nil {
		s.fail(w, err)
		return
	}
	s.refresh()
	s.hub.publish("reload", "decisions")
	written := decisions.FromModel(fresh.Doc, rules)
	writeJSON(w, http.StatusOK, response{OK: true, Written: s.cfg.Model, Reply: written.Reply})
}

func (s *Server) getModel(w http.ResponseWriter, r *http.Request) {
	data, err := os.ReadFile(s.cfg.Model)
	if err != nil {
		problem(w, http.StatusConflict, "%v", err)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(data)
}

// putModel replaces the model file with the editor's text, only when it
// validates. The text is written as sent.
func (s *Server) putModel(w http.ResponseWriter, r *http.Request) {
	data, ok := readBody(w, r)
	if !ok {
		return
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	l, problems, err := s.loader().Bytes(s.cfg.Model, data)
	if err != nil {
		problem(w, http.StatusUnprocessableEntity, "%v", err)
		return
	}
	if len(problems) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, response{Error: "the model does not validate", Outcome: "findings", Findings: problems})
		return
	}
	if len(data) == 0 || data[len(data)-1] != '\n' {
		data = append(data, '\n')
	}
	if err := load.WriteFileAtomic(s.cfg.Model, data); err != nil {
		s.fail(w, err)
		return
	}
	s.refresh()
	s.hub.publish("reload", "model")
	writeJSON(w, http.StatusOK, response{OK: true, Outcome: "ok", Written: s.cfg.Model, Warnings: l.Warnings})
}

func (s *Server) validate(w http.ResponseWriter, r *http.Request) {
	data, ok := readBody(w, r)
	if !ok {
		return
	}
	l, problems, err := s.loader().Bytes(s.cfg.Model, data)
	switch {
	case err != nil:
		writeJSON(w, http.StatusOK, response{OK: false, Outcome: "error", Error: err.Error()})
	case len(problems) > 0:
		writeJSON(w, http.StatusOK, response{OK: false, Outcome: "findings", Findings: problems})
	default:
		writeJSON(w, http.StatusOK, response{OK: true, Outcome: "ok", Warnings: l.Warnings})
	}
}

type settingsRequest struct {
	Accent *string `json:"accent"`
}

// settingsResponse carries the derived accent palette as CSS, so the studio
// previews exactly what an artifact with that accent would use.
type settingsResponse struct {
	OK       bool     `json:"ok"`
	CSS      string   `json:"css"`
	Warnings []string `json:"warnings,omitempty"`
}

func (s *Server) putSettings(w http.ResponseWriter, r *http.Request) {
	var req settingsRequest
	if !decodeBody(w, r, &req) {
		return
	}
	if req.Accent == nil {
		problem(w, http.StatusBadRequest, "accent is required; send an empty string to reset it")
		return
	}
	_, docID, ok := s.ready(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	var err error
	switch accent := strings.TrimSpace(*req.Accent); {
	case accent == "":
		err = s.store.DeleteSetting(ctx, docID, "accent")
	case accentPattern.MatchString(accent):
		err = s.store.PutSetting(ctx, docID, "accent", strings.ToLower(accent))
	default:
		err = errBadAccent
	}
	if errors.Is(err, errBadAccent) {
		problem(w, http.StatusBadRequest, "accent must be a color like #c81e4a")
		return
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	s.hub.publish("settings", clientID(r))
	res := settingsResponse{OK: true}
	if accent := strings.ToLower(strings.TrimSpace(*req.Accent)); accent != "" {
		palette, warnings, err := theme.Derive(accent)
		if err == nil {
			res.CSS, res.Warnings = palette.CSS(), warnings
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(res)
}

var errBadAccent = errors.New("bad accent")
