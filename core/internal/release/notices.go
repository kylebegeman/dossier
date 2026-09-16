package release

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// NoticesFile is the name of the third-party notices in every archive and
// platform package.
const NoticesFile = "THIRD_PARTY_NOTICES.md"

var licenseName = regexp.MustCompile(`(?i)(licen[cs]e|copying|notice)`)

type module struct {
	path, version, dir string
}

// Notices assembles the licenses of everything the dossier binary carries:
// each Go module linked into it on any target, and the C libraries inside
// Graphviz's WebAssembly module, kept in third_party/licenses. A linked
// module without a license file is an error, so no release omits one.
func Notices(ctx context.Context, cfg Config) ([]byte, error) {
	modules := map[string]module{}
	for _, t := range Targets {
		cmd := exec.CommandContext(ctx, "go", "list", "-deps", "-f", "{{with .Module}}{{.Path}}\t{{.Version}}\t{{.Dir}}{{end}}", "./cmd/dossier")
		cmd.Dir = cfg.Core
		cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+t.GOOS, "GOARCH="+t.GOARCH)
		var stderr bytes.Buffer
		cmd.Stderr = &stderr
		out, err := cmd.Output()
		if err != nil {
			return nil, fmt.Errorf("go list for %s/%s: %w: %s", t.GOOS, t.GOARCH, err, strings.TrimSpace(stderr.String()))
		}
		scan := bufio.NewScanner(bytes.NewReader(out))
		for scan.Scan() {
			fields := strings.Split(scan.Text(), "\t")
			if len(fields) != 3 || fields[0] == "dossier" {
				continue
			}
			modules[fields[0]] = module{path: fields[0], version: fields[1], dir: fields[2]}
		}
	}
	paths := make([]string, 0, len(modules))
	for p := range modules {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	var b bytes.Buffer
	b.WriteString("# Third-party notices\n\n")
	b.WriteString("The dossier binary is MIT licensed and includes the software below. Each entry carries its license as the software ships it.\n")
	goroot, err := exec.CommandContext(ctx, "go", "env", "GOROOT").Output()
	if err != nil {
		return nil, fmt.Errorf("go env GOROOT: %w", err)
	}
	// Go keeps LICENSE in GOROOT; some packagers, like Homebrew, move it one
	// level up.
	root := strings.TrimSpace(string(goroot))
	goLicense, err := os.ReadFile(filepath.Join(root, "LICENSE"))
	if errors.Is(err, os.ErrNotExist) {
		goLicense, err = os.ReadFile(filepath.Join(filepath.Dir(root), "LICENSE"))
	}
	if err != nil {
		return nil, fmt.Errorf("the Go license: %w", err)
	}
	b.WriteString("\n## The Go standard library and runtime\n")
	writeText(&b, goLicense)
	for _, p := range paths {
		m := modules[p]
		texts, err := licenseTexts(m.dir)
		if err != nil {
			return nil, err
		}
		if len(texts) == 0 {
			return nil, fmt.Errorf("module %s has no license file in %s", m.path, m.dir)
		}
		fmt.Fprintf(&b, "\n## %s %s\n", m.path, m.version)
		if strings.HasPrefix(filepath.ToSlash(m.dir), filepath.ToSlash(filepath.Join(cfg.Core, "third_party"))) || strings.Contains(filepath.ToSlash(m.dir), "/third_party/") {
			b.WriteString("\nVendored in core/third_party with Dossier's patch; see core/scripts/graphviz.\n")
		}
		for _, text := range texts {
			writeText(&b, text)
		}
	}

	// Software the binary embeds outside Go modules keeps its licenses in
	// third_party/licenses: one directory per bundle, with a README first.
	licenses := filepath.Join(cfg.Core, "third_party", "licenses")
	bundles, err := os.ReadDir(licenses)
	if err != nil {
		return nil, err
	}
	for _, bundle := range bundles {
		if !bundle.IsDir() {
			continue
		}
		dir := filepath.Join(licenses, bundle.Name())
		readme, err := os.ReadFile(filepath.Join(dir, "README.md"))
		if err != nil {
			return nil, fmt.Errorf("third_party/licenses/%s: %w", bundle.Name(), err)
		}
		title, body, _ := strings.Cut(strings.TrimSpace(string(readme)), "\n")
		fmt.Fprintf(&b, "\n## %s\n\n%s\n", strings.TrimSpace(strings.TrimPrefix(title, "#")), strings.TrimSpace(body))
		var files []string
		err = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
			if err == nil && !d.IsDir() && path != filepath.Join(dir, "README.md") {
				files = append(files, path)
			}
			return err
		})
		if err != nil {
			return nil, err
		}
		sort.Strings(files)
		for _, f := range files {
			rel, _ := filepath.Rel(dir, f)
			data, err := os.ReadFile(f)
			if err != nil {
				return nil, err
			}
			fmt.Fprintf(&b, "\n### %s\n", strings.ReplaceAll(filepath.ToSlash(rel), "__", "/"))
			writeText(&b, data)
		}
	}
	return b.Bytes(), nil
}

// licenseTexts reads the license, copying, and notice files at the top of a
// module, in name order.
func licenseTexts(dir string) ([][]byte, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var out [][]byte
	for _, e := range entries {
		if e.IsDir() || !licenseName.MatchString(e.Name()) || strings.HasSuffix(e.Name(), ".go") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return nil, err
		}
		out = append(out, data)
	}
	return out, nil
}

func writeText(b *bytes.Buffer, text []byte) {
	b.WriteString("\n````text\n")
	b.Write(bytes.TrimRight(text, "\n"))
	b.WriteString("\n````\n")
}
