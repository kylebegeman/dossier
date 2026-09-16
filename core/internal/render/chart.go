package render

import (
	"math"
	"strconv"
	"strings"

	"dossier/internal/model"
)

// Chart geometry, shared with the 0.6 renderer so charts look the same.
const (
	chartW    = 640
	chartH    = 300
	chartPadL = 52
	chartPadB = 46
	chartPadT = 24
	chartPadR = 24
	chartTick = 4
)

// chartSVG draws a single-series bar, line, or area chart as inline SVG.
// Colors come from the design tokens so the chart follows the theme.
func chartSVG(title, variant string, data []model.Point) string {
	if len(data) == 0 {
		return ""
	}
	if variant == "" {
		variant = "bar"
	}
	iw := float64(chartW - chartPadL - chartPadR)
	ih := float64(chartH - chartPadT - chartPadB)
	maxV, minV := 0.0, 0.0
	for _, d := range data {
		maxV = math.Max(maxV, d.Value)
		minV = math.Min(minV, d.Value)
	}
	top := maxV
	if top == 0 {
		top = 1
	}
	bottom := math.Min(0, minV)
	span := top - bottom
	if span == 0 {
		span = 1
	}
	y := func(v float64) float64 { return float64(chartPadT) + ih - ((v-bottom)/span)*ih }
	f := func(v float64) string { return strconv.FormatFloat(v, 'f', 1, 64) }
	n := len(data)
	y0 := y(0)
	label := title
	if label == "" {
		label = variant + " chart"
	}
	var b strings.Builder
	b.WriteString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ` + strconv.Itoa(chartW) + ` ` + strconv.Itoa(chartH) + `" role="img" aria-label="` + escape(label) + `">`)
	b.WriteString(`<line x1="` + strconv.Itoa(chartPadL) + `" y1="` + strconv.Itoa(chartPadT) + `" x2="` + strconv.Itoa(chartPadL) + `" y2="` + strconv.Itoa(chartH-chartPadB) + `" stroke="var(--line)"/>`)
	b.WriteString(`<line x1="` + strconv.Itoa(chartPadL) + `" y1="` + strconv.Itoa(chartH-chartPadB) + `" x2="` + strconv.Itoa(chartW-chartPadR) + `" y2="` + strconv.Itoa(chartH-chartPadB) + `" stroke="var(--line)"/>`)
	for i := 0; i <= chartTick; i++ {
		v := bottom + span*float64(i)/chartTick
		ty := y(v)
		b.WriteString(`<line x1="` + strconv.Itoa(chartPadL) + `" y1="` + f(ty) + `" x2="` + strconv.Itoa(chartW-chartPadR) + `" y2="` + f(ty) + `" stroke="var(--line-soft)"/>`)
		b.WriteString(`<text x="` + strconv.Itoa(chartPadL-9) + `" y="` + f(ty+4) + `" text-anchor="end" class="tick">` + escape(formatNumber(math.Round(v*100)/100)) + `</text>`)
	}
	b.WriteString(`<line x1="` + strconv.Itoa(chartPadL) + `" y1="` + f(y0) + `" x2="` + strconv.Itoa(chartW-chartPadR) + `" y2="` + f(y0) + `" stroke="var(--muted)"/>`)
	if variant == "bar" {
		gap := iw / float64(n)
		bw := math.Min(gap*0.62, 56)
		for i, d := range data {
			cx := float64(chartPadL) + gap*float64(i) + gap/2
			yy := y(d.Value)
			b.WriteString(`<rect x="` + f(cx-bw/2) + `" y="` + f(math.Min(yy, y0)) + `" width="` + f(bw) + `" height="` + f(math.Abs(y0-yy)) + `" rx="3" fill="var(--accent)"><title>` + escape(d.Label) + `: ` + escape(formatNumber(d.Value)) + `</title></rect>`)
			ly := math.Min(yy, y0) - 7
			if d.Value < 0 {
				ly = math.Max(yy, y0) + 15
			}
			b.WriteString(`<text x="` + f(cx) + `" y="` + f(ly) + `" text-anchor="middle" class="value">` + escape(formatNumber(d.Value)) + `</text>`)
			b.WriteString(`<text x="` + f(cx) + `" y="` + strconv.Itoa(chartH-chartPadB+21) + `" text-anchor="middle">` + escape(d.Label) + `</text>`)
		}
	} else {
		step := 0.0
		if n > 1 {
			step = iw / float64(n-1)
		}
		pts := make([]string, n)
		for i, d := range data {
			pts[i] = f(float64(chartPadL)+step*float64(i)) + "," + f(y(d.Value))
		}
		if variant == "area" {
			b.WriteString(`<polygon points="` + strconv.Itoa(chartPadL) + `,` + f(y0) + ` ` + strings.Join(pts, " ") + ` ` + f(float64(chartPadL)+step*float64(n-1)) + `,` + f(y0) + `" fill="var(--accent)" fill-opacity="0.12"/>`)
		}
		b.WriteString(`<polyline points="` + strings.Join(pts, " ") + `" fill="none" stroke="var(--accent)" stroke-width="2"/>`)
		for i, d := range data {
			cx := float64(chartPadL) + step*float64(i)
			cy := y(d.Value)
			b.WriteString(`<circle cx="` + f(cx) + `" cy="` + f(cy) + `" r="3" fill="var(--accent)"><title>` + escape(d.Label) + `: ` + escape(formatNumber(d.Value)) + `</title></circle>`)
			b.WriteString(`<text x="` + f(cx) + `" y="` + f(cy-8) + `" text-anchor="middle" class="value">` + escape(formatNumber(d.Value)) + `</text>`)
			b.WriteString(`<text x="` + f(cx) + `" y="` + strconv.Itoa(chartH-chartPadB+21) + `" text-anchor="middle">` + escape(d.Label) + `</text>`)
		}
	}
	b.WriteString("</svg>")
	return b.String()
}

// formatNumber prints a value plainly, with thousands separators past 999.
func formatNumber(v float64) string {
	s := strconv.FormatFloat(v, 'f', -1, 64)
	if math.Abs(v) < 1000 {
		return s
	}
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	whole, frac, _ := strings.Cut(s, ".")
	var out []byte
	for i, c := range []byte(whole) {
		if i > 0 && (len(whole)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	res := string(out)
	if frac != "" {
		res += "." + frac
	}
	if neg {
		res = "-" + res
	}
	return res
}
