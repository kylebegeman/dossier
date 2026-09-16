// Package schema validates raw model JSON against the embedded JSON Schema
// before strict decoding.
package schema

import (
	"bytes"
	_ "embed"
	"errors"
	"fmt"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"

	"dossier/internal/model"
)

//go:embed dossier.model.schema.json
var modelSchema []byte

//go:embed dossier.result.schema.json
var resultSchema []byte

// ModelSchemaJSON returns the embedded dossier.model/v1 schema.
func ModelSchemaJSON() []byte { return append([]byte(nil), modelSchema...) }

// ResultSchemaJSON returns the embedded dossier.result/v1 envelope schema.
func ResultSchemaJSON() []byte { return append([]byte(nil), resultSchema...) }

const (
	modelSchemaURL  = "https://dossier.dev/schemas/dossier.model/v1"
	resultSchemaURL = "https://dossier.dev/schemas/dossier.result/v1"
)

func compile(url string, raw []byte) func() (*jsonschema.Schema, error) {
	return sync.OnceValues(func() (*jsonschema.Schema, error) {
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(raw))
		if err != nil {
			return nil, fmt.Errorf("%s: %w", url, err)
		}
		c := jsonschema.NewCompiler()
		if err := c.AddResource(url, doc); err != nil {
			return nil, err
		}
		return c.Compile(url)
	})
}

var (
	compiledModel  = compile(modelSchemaURL, modelSchema)
	compiledResult = compile(resultSchemaURL, resultSchema)
)

var printer = message.NewPrinter(language.English)

// CheckModel validates raw model JSON. Schema violations come back as
// problems; an error means the input was not JSON at all or the schema
// failed to load.
func CheckModel(data []byte) ([]model.Problem, error) {
	return check(compiledModel, data)
}

// CheckEnvelope validates a dossier.result/v1 envelope the same way.
func CheckEnvelope(data []byte) ([]model.Problem, error) {
	return check(compiledResult, data)
}

func check(compiled func() (*jsonschema.Schema, error), data []byte) ([]model.Problem, error) {
	sch, err := compiled()
	if err != nil {
		return nil, err
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("parse JSON: %w", err)
	}
	err = sch.Validate(inst)
	if err == nil {
		return nil, nil
	}
	var ve *jsonschema.ValidationError
	if !errors.As(err, &ve) {
		return nil, err
	}
	var out []model.Problem
	leaves(ve, &out)
	return out, nil
}

func leaves(e *jsonschema.ValidationError, out *[]model.Problem) {
	if len(e.Causes) == 0 {
		*out = append(*out, model.Problem{Path: "/" + strings.Join(e.InstanceLocation, "/"), Message: e.ErrorKind.LocalizedString(printer)})
		return
	}
	for _, c := range e.Causes {
		leaves(c, out)
	}
}
