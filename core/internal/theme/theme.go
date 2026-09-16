// Package theme derives the artifact's accent palette from one brand color.
// It works in OKLCH, so lightness moves without shifting the hue, and it
// checks every pairing the stylesheet uses against WCAG AA before choosing a
// color. The arithmetic is written to give the same colors on every platform:
// products carry explicit conversions so no compiler fuses them into FMA
// instructions, intermediate values are quantized so a last-bit difference in
// a math function cannot move a result, and colors are compared only after
// rounding to 8-bit hex.
package theme

import (
	"fmt"
	"math"
	"regexp"
	"strings"
)

// MinContrast is the WCAG AA ratio for body text.
const MinContrast = 4.5

// The token backgrounds accent text sits on, from tokens.css. Light paper is
// darker than the light background, so text that reads on paper reads on
// both; in the dark theme both are checked.
var (
	lightPaper = mustParse("#f7f5f7")
	darkBg     = mustParse("#141216")
	darkPaper  = mustParse("#1c191e")
	white      = mustParse("#ffffff")
)

// Palette is the accent family for both themes.
type Palette struct {
	Light Tones `json:"light"`
	Dark  Tones `json:"dark"`
}

// Tones are one theme's accent, its soft wash, and the ink that sits on it.
type Tones struct {
	Accent string `json:"accent"`
	Soft   string `json:"soft"`
	Ink    string `json:"ink"`
}

var hexPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// Valid reports whether s is a #rrggbb color.
func Valid(s string) bool { return hexPattern.MatchString(s) }

// Derive builds the palette from a brand color. The light accent is the
// color itself when it reads on the light background; a color too light for
// text is darkened, and the warning says what the artifact uses instead.
func Derive(hex string) (Palette, []string, error) {
	base, err := parse(hex)
	if err != nil {
		return Palette{}, nil, err
	}
	var warnings []string
	src := toOKLCH(base)

	// Light: the brand color when it reads, darkened until it does otherwise.
	accent := base
	if contrast(accent, lightPaper) < MinContrast {
		accent = descend(src, func(c rgb) bool { return contrast(c, lightPaper) >= MinContrast })
	}
	soft := ascend(oklch{L: 0.95, C: math.Min(float64(src.C*0.22), 0.035), H: src.H}, 0.985, func(c rgb) bool { return contrast(accent, c) >= MinContrast })
	if contrast(accent, soft) < MinContrast {
		// Even the lightest wash cannot carry the accent: darken the accent.
		accent = descend(toOKLCH(accent), func(c rgb) bool { return contrast(c, soft) >= MinContrast })
	}
	if accent != base {
		warnings = append(warnings, fmt.Sprintf("accent %s is too light to read on the light background; the artifact uses %s", strings.ToLower(hex), accent.hex()))
	}
	light := Tones{Accent: accent.hex(), Soft: soft.hex(), Ink: white.hex()}

	// Dark: the same hue, lifted until it reads on the dark background.
	dc := oklch{L: math.Max(src.L, 0.72), C: math.Min(float64(src.C*0.8), 0.17), H: src.H}
	darkAccent := climb(dc, func(c rgb) bool { return contrast(c, darkPaper) >= MinContrast && contrast(c, darkBg) >= MinContrast })
	darkInk := descend(oklch{L: 0.25, C: math.Min(float64(src.C*0.35), 0.07), H: src.H}, func(c rgb) bool { return contrast(c, darkAccent) >= MinContrast })
	darkSoft := descend(oklch{L: 0.27, C: math.Min(float64(src.C*0.3), 0.06), H: src.H}, func(c rgb) bool { return contrast(darkAccent, c) >= MinContrast })
	dark := Tones{Accent: darkAccent.hex(), Soft: darkSoft.hex(), Ink: darkInk.hex()}
	return Palette{Light: light, Dark: dark}, warnings, nil
}

// CSS renders the palette with the same three selectors tokens.css uses, so
// appended after the tokens it wins in both themes and under both toggles.
func (p Palette) CSS() string {
	vars := func(t Tones) string {
		return "--accent: " + t.Accent + "; --accent-ink: " + t.Ink + "; --accent-soft: " + t.Soft + ";"
	}
	return ":root { " + vars(p.Light) + " }\n" +
		"@media (prefers-color-scheme: dark) { :root:not([data-theme=\"light\"]) { " + vars(p.Dark) + " } }\n" +
		":root[data-theme=\"dark\"] { " + vars(p.Dark) + " }\n"
}

// Contrast is the WCAG contrast ratio of two #rrggbb colors.
func Contrast(a, b string) (float64, error) {
	ca, err := parse(a)
	if err != nil {
		return 0, err
	}
	cb, err := parse(b)
	if err != nil {
		return 0, err
	}
	return contrast(ca, cb), nil
}

// descend lowers lightness from the start until ok holds, in fixed steps.
func descend(start oklch, ok func(rgb) bool) rgb {
	c := start
	for {
		col := gamut(c)
		if ok(col) || c.L <= 0 {
			return col
		}
		c.L = math.Max(float64(c.L-0.005), 0)
	}
}

// climb raises lightness from the start until ok holds, in fixed steps.
func climb(start oklch, ok func(rgb) bool) rgb {
	c := start
	for {
		col := gamut(c)
		if ok(col) || c.L >= 1 {
			return col
		}
		c.L = math.Min(float64(c.L+0.005), 1)
	}
}

// ascend raises lightness up to limit until ok holds, and settles for the
// limit when it never does.
func ascend(start oklch, limit float64, ok func(rgb) bool) rgb {
	c := start
	for {
		col := gamut(c)
		if ok(col) || c.L >= limit {
			return col
		}
		c.L = math.Min(float64(c.L+0.005), limit)
	}
}

type rgb struct{ R, G, B uint8 }

type oklch struct{ L, C, H float64 }

func mustParse(hex string) rgb {
	c, err := parse(hex)
	if err != nil {
		panic(err)
	}
	return c
}

func parse(hex string) (rgb, error) {
	if !Valid(hex) {
		return rgb{}, fmt.Errorf("accent must be a color like #c81e4a, not %q", hex)
	}
	var c rgb
	_, err := fmt.Sscanf(strings.ToLower(hex[1:]), "%02x%02x%02x", &c.R, &c.G, &c.B)
	return c, err
}

func (c rgb) hex() string { return fmt.Sprintf("#%02x%02x%02x", c.R, c.G, c.B) }

func linear(v uint8) float64 {
	s := float64(v) / 255
	if s <= 0.04045 {
		return s / 12.92
	}
	return math.Pow((s+0.055)/1.055, 2.4)
}

func encode(v float64) uint8 {
	if v <= 0.0031308 {
		v = float64(12.92 * v)
	} else {
		v = float64(1.055*math.Pow(v, 1/2.4)) - 0.055
	}
	return uint8(math.Round(float64(math.Max(0, math.Min(1, v)) * 255)))
}

// luminance is WCAG relative luminance.
func luminance(c rgb) float64 {
	return float64(0.2126*linear(c.R)) + float64(0.7152*linear(c.G)) + float64(0.0722*linear(c.B))
}

func contrast(a, b rgb) float64 {
	la, lb := luminance(a), luminance(b)
	if la < lb {
		la, lb = lb, la
	}
	return (la + 0.05) / (lb + 0.05)
}

func toOKLCH(c rgb) oklch {
	r, g, b := linear(c.R), linear(c.G), linear(c.B)
	l := math.Cbrt(float64(0.4122214708*r) + float64(0.5363325363*g) + float64(0.0514459929*b))
	m := math.Cbrt(float64(0.2119034982*r) + float64(0.6806995451*g) + float64(0.1073969566*b))
	s := math.Cbrt(float64(0.0883024619*r) + float64(0.2817188376*g) + float64(0.6299787005*b))
	L := float64(0.2104542553*l) + float64(0.7936177850*m) - float64(0.0040720468*s)
	A := float64(1.9779984951*l) - float64(2.4285922050*m) + float64(0.4505937099*s)
	B := float64(0.0259040371*l) + float64(0.7827717662*m) - float64(0.8086757660*s)
	C := math.Sqrt(float64(A*A) + float64(B*B))
	H := 0.0
	if C > 1e-7 {
		H = math.Atan2(B, A)
	}
	return oklch{L: quantize(L), C: quantize(C), H: quantize(H)}
}

// quantize rounds to nine decimal places, far below what 8-bit color can
// show and far above the last-bit noise of math functions across platforms.
func quantize(x float64) float64 { return math.Round(float64(x*1e9)) / 1e9 }

// linearRGB converts OKLCH to linear sRGB, which may fall outside [0, 1].
func linearRGB(c oklch) (float64, float64, float64) {
	A, B := float64(c.C*math.Cos(c.H)), float64(c.C*math.Sin(c.H))
	l := c.L + float64(0.3963377774*A) + float64(0.2158037573*B)
	m := c.L - float64(0.1055613458*A) - float64(0.0638541728*B)
	s := c.L - float64(0.0894841775*A) - float64(1.2914855480*B)
	l, m, s = float64(l*l*l), float64(m*m*m), float64(s*s*s)
	r := float64(4.0767416621*l) - float64(3.3077115913*m) + float64(0.2309699292*s)
	g := float64(-1.2684380046*l) + float64(2.6097574011*m) - float64(0.3413193965*s)
	b := float64(-0.0041960863*l) - float64(0.7034186147*m) + float64(1.7076147010*s)
	return quantize(r), quantize(g), quantize(b)
}

func inGamut(c oklch) bool {
	const eps = 1e-6
	r, g, b := linearRGB(c)
	return r >= -eps && r <= 1+eps && g >= -eps && g <= 1+eps && b >= -eps && b <= 1+eps
}

// gamut maps a color into sRGB by lowering chroma, keeping lightness and hue.
func gamut(c oklch) rgb {
	c.L = math.Max(0, math.Min(1, c.L))
	if !inGamut(c) {
		lo, hi := 0.0, c.C
		for i := 0; i < 32; i++ {
			mid := (lo + hi) / 2
			if inGamut(oklch{L: c.L, C: mid, H: c.H}) {
				lo = mid
			} else {
				hi = mid
			}
		}
		c.C = lo
	}
	r, g, b := linearRGB(c)
	return rgb{encode(r), encode(g), encode(b)}
}
