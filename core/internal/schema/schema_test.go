package schema

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestExampleValidates(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "examples", "winter-crossing.dossier.json"))
	if err != nil {
		t.Fatal(err)
	}
	problems, err := CheckModel(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) > 0 {
		t.Errorf("example has schema problems: %v", problems)
	}
}

func TestRejectsUnknownAndBadValues(t *testing.T) {
	problems, err := CheckModel([]byte(`{"dossier":"1.0","kind":"brainstorm","meta":{"title":"T","slug":"Bad Slug","extra":1},"sections":[]}`))
	if err != nil {
		t.Fatal(err)
	}
	joined := ""
	for _, p := range problems {
		joined += p.String() + "\n"
	}
	for _, want := range []string{"/meta/slug", "/meta", "/sections"} {
		if !strings.Contains(joined, want) {
			t.Errorf("expected a problem at %s, got:\n%s", want, joined)
		}
	}
	if _, err := CheckModel([]byte(`not json`)); err == nil {
		t.Error("non-JSON must be an error")
	}
}

func TestMediaPartsValidate(t *testing.T) {
	doc := `{"dossier":"1.0","kind":"brief","meta":{"title":"T","slug":"t"},"sections":[{"id":"s","title":"S","parts":[
		{"type":"figure","src":"a.png","alt":"A","caption":"Cap"},
		{"type":"diagram","source":"digraph {}","format":"dot"},
		{"type":"chart","variant":"bar","data":[{"label":"Q1","value":1.5}]},
		{"type":"code","lang":"go","code":"package x","title":"x.go"}]}]}`
	problems, err := CheckModel([]byte(doc))
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) > 0 {
		t.Errorf("media parts have schema problems: %v", problems)
	}
	problems, err = CheckModel([]byte(`{"dossier":"1.0","kind":"brief","meta":{"title":"T","slug":"t"},"sections":[{"id":"s","title":"S","parts":[{"type":"chart","variant":"pie","data":[{"label":"a","value":"1"}]}]}]}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) < 2 {
		t.Errorf("expected variant and value problems, got %v", problems)
	}
}

func TestEnvelopeSchema(t *testing.T) {
	good := []string{
		`{"schema_version":"dossier.result/v1","command":"build","outcome":"ok","result":{"schema_version":"dossier.build-result/v1","outputs":[]},"warnings":[{"path":"a#/b","message":"m"}]}`,
		`{"schema_version":"dossier.result/v1","command":"validate","outcome":"findings","findings":[{"path":"x","message":"y"}],"error":{"code":"invalid","message":"1 model(s) did not validate"}}`,
		`{"schema_version":"dossier.result/v1","command":"decisions.apply","outcome":"error","error":{"code":"usage","message":"nope"}}`,
	}
	for _, g := range good {
		problems, err := CheckEnvelope([]byte(g))
		if err != nil || len(problems) > 0 {
			t.Errorf("valid envelope rejected: %v %v\n%s", err, problems, g)
		}
	}
	bad := []string{
		`{"schema_version":"dossier.result/v1","command":"build","outcome":"error"}`,
		`{"schema_version":"dossier.result/v1","command":"build","outcome":"ok","error":{"code":"x","message":"y"}}`,
		`{"schema_version":"dossier.result/v1","command":"build","outcome":"findings"}`,
		`{"schema_version":"dossier.result/v2","command":"build","outcome":"ok"}`,
		`{"schema_version":"dossier.result/v1","command":"build","outcome":"ok","result":{"outputs":[]}}`,
	}
	for _, b := range bad {
		problems, err := CheckEnvelope([]byte(b))
		if err != nil {
			t.Fatal(err)
		}
		if len(problems) == 0 {
			t.Errorf("invalid envelope accepted: %s", b)
		}
	}
}

func TestKindSchemaRejectsUnknownShapes(t *testing.T) {
	problems, err := CheckKind([]byte(`{"id":"x","title":"X","summary":"s","item":{"noun":"a","plural":"as","numbered":true},"fields":{"priority":{}},"facets":[],"sections":[],"columns":["rank"],"decision":{"mode":"vote"}}`))
	if err != nil {
		t.Fatal(err)
	}
	joined := ""
	for _, p := range problems {
		joined += p.String() + "\n"
	}
	for _, want := range []string{"/fields", "/columns/0", "/decision/mode"} {
		if !strings.Contains(joined, want) {
			t.Errorf("expected a problem at %s, got:\n%s", want, joined)
		}
	}
}
