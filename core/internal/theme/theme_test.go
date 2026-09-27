package theme

import (
	"strings"
	"testing"
)

// pairs are the pairings the stylesheet puts accent colors in, with the
// backgrounds they must read on.
func pairs(p Palette) map[string][2]string {
	return map[string][2]string{
		"light accent on paper":        {p.Light.Accent, "#eeeeee"},
		"light accent on background":   {p.Light.Accent, "#ffffff"},
		"light accent on its wash":     {p.Light.Accent, p.Light.Soft},
		"light ink on accent":          {p.Light.Ink, p.Light.Accent},
		"dark accent on paper":         {p.Dark.Accent, "#252525"},
		"dark accent on background":    {p.Dark.Accent, "#121212"},
		"dark accent on its wash":      {p.Dark.Accent, p.Dark.Soft},
		"dark ink on accent":           {p.Dark.Ink, p.Dark.Accent},
		"light text on the light wash": {"#222222", p.Light.Soft},
		"dark text on the dark wash":   {"#ededed", p.Dark.Soft},
	}
}

func TestEveryPairingReadsForEveryColor(t *testing.T) {
	steps := []string{"00", "33", "66", "99", "cc", "ff"}
	for _, r := range steps {
		for _, g := range steps {
			for _, b := range steps {
				hex := "#" + r + g + b
				p, _, err := Derive(hex)
				if err != nil {
					t.Fatal(err)
				}
				for name, pair := range pairs(p) {
					if c, _ := Contrast(pair[0], pair[1]); c < MinContrast {
						t.Errorf("%s: %s is %.2f (%s on %s)", hex, name, c, pair[0], pair[1])
					}
				}
			}
		}
	}
}

func TestDeriveKeepsAReadableBrandColor(t *testing.T) {
	p, warnings, err := Derive("#C81E4A")
	if err != nil || len(warnings) > 0 {
		t.Fatalf("%v %v", err, warnings)
	}
	if p.Light.Accent != "#c81e4a" || p.Light.Ink != "#ffffff" {
		t.Errorf("a readable color is used as given: %+v", p.Light)
	}
}

func TestDeriveDarkensAColorTooLightForText(t *testing.T) {
	p, warnings, err := Derive("#ffd400")
	if err != nil {
		t.Fatal(err)
	}
	if len(warnings) != 1 || !strings.Contains(warnings[0], "accent #ffd400 is too light to read on the light background; the artifact uses "+p.Light.Accent) {
		t.Errorf("warnings: %v", warnings)
	}
	if p.Dark.Accent == p.Light.Accent {
		t.Error("the dark theme keeps its own, lighter accent")
	}
	if _, _, err := Derive("red"); err == nil {
		t.Error("only #rrggbb colors derive")
	}
}

// TestDeriveIsStable pins exact colors, so CI on another architecture proves
// the arithmetic gives the same palette everywhere.
func TestDeriveIsStable(t *testing.T) {
	for hex, want := range map[string]Palette{
		"#c81e4a": {Light: Tones{Accent: "#c81e4a", Soft: "#ffe8e9", Ink: "#ffffff"}, Dark: Tones{Accent: "#f87586", Soft: "#3f181d", Ink: "#3c1017"}},
		"#2563eb": {Light: Tones{Accent: "#2461e9", Soft: "#e6efff", Ink: "#ffffff"}, Dark: Tones{Accent: "#73a2ff", Soft: "#162544", Ink: "#0f2043"}},
		"#ffd400": {Light: Tones{Accent: "#816a00", Soft: "#f6efd5", Ink: "#ffffff"}, Dark: Tones{Accent: "#f7d65b", Soft: "#2f2601", Ink: "#2a2100"}},
		"#08776e": {Light: Tones{Accent: "#08776e", Soft: "#e1f3f0", Ink: "#ffffff"}, Dark: Tones{Accent: "#6fb3ab", Soft: "#172b28", Ink: "#0e2624"}},
	} {
		got, _, err := Derive(hex)
		if err != nil || got != want {
			t.Errorf("%s:\n got %+v\nwant %+v", hex, got, want)
		}
	}
}

func TestCSSUsesTheTokenSelectors(t *testing.T) {
	p, _, _ := Derive("#2563eb")
	css := p.CSS()
	for _, want := range []string{
		":root { --accent: #2461e9; --accent-ink: #ffffff; --accent-soft: #e6efff; }",
		"@media (prefers-color-scheme: dark) { :root:not([data-theme=\"light\"]) { --accent: #73a2ff;",
		":root[data-theme=\"dark\"] { --accent: #73a2ff;",
	} {
		if !strings.Contains(css, want) {
			t.Errorf("css lacks %q:\n%s", want, css)
		}
	}
}
