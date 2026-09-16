package doors

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestSkillIsCurrent fails when skill/SKILL.md drifts from the catalog and
// the kinds. Regenerate with make generate.
func TestSkillIsCurrent(t *testing.T) {
	want, err := Skill()
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join("..", "..", "skill", "SKILL.md")
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("%v; run make generate", err)
	}
	if string(got) != string(want) {
		t.Errorf("skill/SKILL.md is stale; run make generate and commit")
	}
	for _, must := range []string{"name: dossier", "### brainstorm", "  - How it works*: The mechanism", "### incident", "- **Decision:** verdicts go, revise, skip", "| `dossier init KIND [--force] [--out OUT] [--slug SLUG] [--title TITLE]` |", "`dossier validate FILES...`", "agent time, never calendar time", "`decisions_apply`", "\"kind\": \"brainstorm\""} {
		if !strings.Contains(string(want), must) {
			t.Errorf("skill lacks %q", must)
		}
	}
	for _, mustNot := range []string{"days of work", "weeks of work", "`mcp` |", "`skill` |"} {
		if strings.Contains(string(want), mustNot) {
			t.Errorf("skill must not contain %q", mustNot)
		}
	}
}

func TestSkillDoorWrites(t *testing.T) {
	path := filepath.Join(t.TempDir(), "skills", "dossier", "SKILL.md")
	env, code := run(t, "skill", "--write", path)
	if code != 0 || env.Outcome != OutcomeOK {
		t.Fatalf("skill: %d %+v", code, env)
	}
	if _, err := os.Stat(path); err != nil {
		t.Error(err)
	}
	env, _ = run(t, "skill")
	if !strings.Contains(string(mustJSON(env.Result)), "# Dossier") {
		t.Errorf("skill result lacks the markdown: %+v", env)
	}
}
