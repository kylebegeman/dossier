package render

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"

	"dossier/internal/decisions"
	"dossier/internal/kinds"
	"dossier/internal/model"
)

// Markdown renders the document as Markdown for places that cannot run the
// artifact: a pull request, a wiki, a terminal. It carries the same content
// in plain form: the masthead and its facts, every part as Markdown, boards
// as a summary table followed by numbered items with a field line and facet
// headings, rows as a list, and the decision block with the reply so far.
func Markdown(doc *model.Document, kind kinds.Kind) ([]byte, error) {
	page, err := build(doc, kind, Options{})
	if err != nil {
		return nil, err
	}
	var b bytes.Buffer
	w := func(format string, args ...any) { fmt.Fprintf(&b, format, args...) }

	w("# %s\n\n", oneLine(doc.Meta.Title))
	if doc.Meta.Kicker != "" {
		w("*%s*\n\n", oneLine(doc.Meta.Kicker))
	}
	if doc.Meta.Lede != "" {
		w("%s\n\n", strings.TrimSpace(doc.Meta.Lede))
	}
	if len(page.Facts) > 0 {
		var facts []string
		for _, f := range page.Facts {
			facts = append(facts, "**"+oneLine(f.Value)+"** "+oneLine(f.Label))
		}
		w("%s\n\n", strings.Join(facts, " · "))
	}
	if stamp := strings.Trim(strings.Join([]string{doc.Meta.Updated, doc.Meta.Status}, " · "), " ·"); stamp != "" {
		w("%s\n\n", stamp)
	}

	for si, s := range doc.Sections {
		w("## %s\n\n", oneLine(s.Title))
		for _, p := range s.Parts {
			markdownPart(&b, p)
		}
		if s.Board == nil {
			continue
		}
		view := page.Sections[si].Board
		if view.Rows {
			markdownRows(&b, s.Board.Items, view)
			continue
		}
		if view.Summary {
			markdownSummary(&b, view, page)
			if view.Legend != "" {
				w("*%s*\n\n", oneLine(view.Legend))
			}
		}
		for i, it := range s.Board.Items {
			markdownItem(&b, it, view.Items[i], page, kind, doc)
		}
	}

	if page.Decides {
		w("## %s\n\n", oneLine(kind.Decision.Title))
		if md := strings.TrimSpace(kind.Decision.Markdown); md != "" {
			w("%s\n\n", md)
		}
		if c := page.Choice; c != nil {
			w("**%s**\n\n", oneLine(c.Question))
			for _, o := range c.Options {
				line := fmt.Sprintf("- `%s` **%s**", o.ID, oneLine(o.Label))
				if o.Summary != "" {
					line += ": " + oneLine(o.Summary)
				}
				if o.Checked {
					line += " (chosen)"
				}
				w("%s\n", line)
			}
			w("\n")
		}
		if page.ReplyExample != "" {
			w("For example: `%s`\n\n", page.ReplyExample)
		}
		if doc.Decisions == nil {
			w("No decisions yet.\n")
		} else {
			w("Reply so far: `%s`\n", page.Reply)
		}
	}
	return append(bytes.TrimRight(b.Bytes(), "\n"), '\n'), nil
}

func markdownPart(b *bytes.Buffer, p model.Part) {
	w := func(format string, args ...any) { fmt.Fprintf(b, format, args...) }
	switch p.Type {
	case "prose":
		w("%s\n\n", strings.TrimSpace(p.Markdown))
	case "callout":
		title := p.Title
		if title == "" && p.Tone == "risk" {
			title = "Risk"
		}
		if title != "" {
			w("> **%s**\n>\n", oneLine(title))
		}
		for _, line := range strings.Split(strings.TrimSpace(p.Markdown), "\n") {
			w("%s\n", strings.TrimRight("> "+line, " "))
		}
		w("\n")
	case "spec":
		for _, r := range p.Spec {
			w("- **%s**: %s\n", oneLine(r.Label), oneLine(r.Text))
		}
		w("\n")
	case "table":
		if p.Title != "" {
			w("**%s**\n\n", oneLine(p.Title))
		}
		table(b, p.Columns, p.Rows)
		if p.Note != "" {
			w("*%s*\n\n", oneLine(p.Note))
		}
	case "code":
		if p.Title != "" {
			w("**%s**\n\n", oneLine(p.Title))
		}
		fence(b, p.Lang, p.Code)
	case "figure":
		w("![%s](%s)\n\n", oneLine(p.Alt), p.Src)
		if p.Caption != "" {
			w("*%s*\n\n", oneLine(p.Caption))
		}
	case "diagram":
		if p.Title != "" {
			w("**%s**\n\n", oneLine(p.Title))
		}
		format := p.Format
		if format == "" {
			format = "dot"
		}
		fence(b, format, p.Source)
	case "chart":
		if p.Title != "" {
			w("**%s**\n\n", oneLine(p.Title))
		}
		var rows [][]string
		for _, pt := range p.Data {
			rows = append(rows, []string{pt.Label, strconv.FormatFloat(pt.Value, 'f', -1, 64)})
		}
		table(b, []string{"", "Value"}, rows)
	case "timeline":
		if p.Title != "" {
			w("**%s**\n\n", oneLine(p.Title))
		}
		for _, e := range p.Events {
			w("- **%s** %s", oneLine(e.At), oneLine(e.Title))
			if md := strings.TrimSpace(e.Markdown); md != "" {
				// A trailing backslash breaks the line inside the list item.
				w("\\\n  %s", oneLine(md))
			}
			w("\n")
		}
		w("\n")
	}
}

// markdownSummary writes the board's summary table with the kind's columns.
// The decision column shows the model's own picks or verdicts, and is left
// out while the model has none.
func markdownSummary(b *bytes.Buffer, view *BoardView, page *Page) {
	var headers []string
	var columns []Column
	for _, c := range view.Columns {
		if c.Name != "decision" || page.Doc.Decisions != nil {
			columns = append(columns, c)
		}
	}
	for _, c := range columns {
		switch c.Name {
		case "decision":
			if page.Mode == decisions.ModePick {
				headers = append(headers, "Picked")
			} else {
				headers = append(headers, "Verdict")
			}
		default:
			headers = append(headers, c.Header)
		}
	}
	var rows [][]string
	for _, it := range view.Items {
		var row []string
		for _, c := range columns {
			switch c.Name {
			case "number":
				row = append(row, strconv.Itoa(it.Number))
			case "title":
				row = append(row, it.Title)
			case "decision":
				row = append(row, decisionText(it, page))
			case "impact":
				row = append(row, impactText(it))
			case "dependsOn":
				row = append(row, dependsText(it))
			default:
				row = append(row, it.Cells[c.Name].Text)
			}
		}
		rows = append(rows, row)
	}
	table(b, headers, rows)
}

func markdownItem(b *bytes.Buffer, it model.Item, view ItemView, page *Page, kind kinds.Kind, doc *model.Document) {
	w := func(format string, args ...any) { fmt.Fprintf(b, format, args...) }
	if view.Numbered {
		w("### %d. %s\n\n", view.Number, oneLine(it.Title))
	} else {
		w("### %s\n\n", oneLine(it.Title))
	}
	var fields []string
	for _, c := range view.Chips {
		switch c.Tone {
		case "owner":
			fields = append(fields, c.Label+" "+c.Text)
		default:
			fields = append(fields, c.Text)
		}
	}
	if view.Impact > 0 {
		fields = append(fields, fmt.Sprintf("%s %d/%d", kind.FieldLabel("impact"), view.Impact, view.ImpactMax))
	}
	if deps := dependsText(view); deps != "" {
		fields = append(fields, kind.FieldLabel("dependsOn")+" "+deps)
	}
	if state := decisionText(view, page); state != "" {
		if page.Mode == decisions.ModePick {
			fields = append(fields, "Picked")
		} else {
			fields = append(fields, "Verdict: "+state)
		}
	}
	if len(fields) > 0 {
		w("%s\n\n", strings.Join(fields, " · "))
	}
	if it.Summary != "" {
		w("%s\n\n", strings.TrimSpace(it.Summary))
	}
	for _, f := range it.Facets {
		w("#### %s\n\n%s\n\n", oneLine(f.Label), strings.TrimSpace(f.Markdown))
	}
	if doc.Decisions != nil && strings.TrimSpace(doc.Decisions.Notes[it.ID]) != "" {
		w("**Note:** %s\n\n", oneLine(doc.Decisions.Notes[it.ID]))
	}
}

// markdownRows writes a rows board as a list, with any facets indented
// under their entry.
func markdownRows(b *bytes.Buffer, items []model.Item, view *BoardView) {
	for i, it := range items {
		line := "- **" + oneLine(it.Title) + "**"
		var chips []string
		for _, c := range view.Items[i].Chips {
			chips = append(chips, c.Text)
		}
		if len(chips) > 0 {
			line += " (" + strings.Join(chips, ", ") + ")"
		}
		if it.Summary != "" {
			line += "\\\n  " + oneLine(it.Summary)
		}
		fmt.Fprintf(b, "%s\n", line)
		for _, f := range it.Facets {
			fmt.Fprintf(b, "\n  *%s:* %s\n", oneLine(f.Label), oneLine(f.Markdown))
		}
	}
	b.WriteString("\n")
}

func decisionText(it ItemView, page *Page) string {
	switch {
	case it.Picked:
		return "yes"
	case it.Verdict != "":
		for _, v := range page.Kind.Decision.Verdicts {
			if v.ID == it.Verdict {
				return v.Label
			}
		}
		return it.Verdict
	}
	return ""
}

func impactText(it ItemView) string {
	if it.Impact == 0 {
		return ""
	}
	return fmt.Sprintf("%d/%d", it.Impact, it.ImpactMax)
}

func dependsText(it ItemView) string {
	var nums []string
	for _, d := range it.DependsOn {
		if d.Number > 0 {
			nums = append(nums, strconv.Itoa(d.Number))
		} else {
			nums = append(nums, d.Title)
		}
	}
	return strings.Join(nums, ", ")
}

// table writes a pipe table. Cells keep their inline Markdown; pipes are
// escaped and line breaks folded, so a cell cannot break the table.
func table(b *bytes.Buffer, headers []string, rows [][]string) {
	cell := func(s string) string { return strings.ReplaceAll(oneLine(s), "|", `\|`) }
	var head, rule []string
	for _, h := range headers {
		head = append(head, cell(h))
		rule = append(rule, "---")
	}
	fmt.Fprintf(b, "| %s |\n| %s |\n", strings.Join(head, " | "), strings.Join(rule, " | "))
	for _, row := range rows {
		cells := make([]string, len(row))
		for i, c := range row {
			cells[i] = cell(c)
		}
		fmt.Fprintf(b, "| %s |\n", strings.Join(cells, " | "))
	}
	b.WriteString("\n")
}

// fence writes a fenced code block long enough to hold any backticks in the
// code.
func fence(b *bytes.Buffer, lang, code string) {
	ticks := "```"
	for strings.Contains(code, ticks) {
		ticks += "`"
	}
	fmt.Fprintf(b, "%s%s\n%s\n%s\n\n", ticks, lang, strings.TrimRight(code, "\n"), ticks)
}

// oneLine folds whitespace, including line breaks, into single spaces.
func oneLine(s string) string { return strings.Join(strings.Fields(s), " ") }
