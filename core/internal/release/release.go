// Package release builds Dossier's distribution from one version: CGO-free
// binaries for every target, deterministic archives with checksums, the npm
// packages (one per platform plus the launcher that depends on them), and the
// Homebrew formula. Check dry-runs all of it without publishing anything.
package release

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"text/template"
	"time"
)

// Target is one GOOS and GOARCH the release builds.
type Target struct {
	GOOS   string
	GOARCH string
}

// Targets are the platforms every release ships.
var Targets = []Target{
	{"darwin", "arm64"}, {"darwin", "amd64"},
	{"linux", "arm64"}, {"linux", "amd64"},
	{"windows", "arm64"}, {"windows", "amd64"},
}

// NPM names the target the way Node does: process.platform and process.arch.
func (t Target) NPM() string {
	platform, arch := t.GOOS, t.GOARCH
	if platform == "windows" {
		platform = "win32"
	}
	if arch == "amd64" {
		arch = "x64"
	}
	return platform + "-" + arch
}

// Exe is the binary's file name.
func (t Target) Exe() string {
	if t.GOOS == "windows" {
		return "dossier.exe"
	}
	return "dossier"
}

// Archive is the release asset's file name.
func (t Target) Archive(version string) string {
	ext := ".tar.gz"
	if t.GOOS == "windows" {
		ext = ".zip"
	}
	return fmt.Sprintf("dossier_%s_%s_%s%s", version, t.GOOS, t.GOARCH, ext)
}

// Package is the target's npm package name.
func (t Target) Package() string { return "@kylebegeman/dossier-" + t.NPM() }

// Config locates the inputs and outputs of a release.
type Config struct {
	Version string
	// Core is the Go module to build; Repo is the repository root holding
	// LICENSE, README.md, and packages/dossier.
	Core string
	Repo string
	// Out is the distribution directory. It is replaced on every build and
	// must be named dist.
	Out string
	// ReleaseBase is where the archives are downloaded from.
	ReleaseBase string
	Log         io.Writer
	// Compile builds one target's binary; tests replace it.
	Compile func(ctx context.Context, cfg Config, t Target, dst string) error
}

var versionPattern = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$`)

// epoch stamps every archive entry so rebuilding the same binaries yields the
// same bytes and the same checksums.
var epoch = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

const marker = ".dossier-release"

func (cfg *Config) defaults() error {
	if !versionPattern.MatchString(cfg.Version) {
		return fmt.Errorf("version %q is not a semantic version", cfg.Version)
	}
	if filepath.Base(filepath.Clean(cfg.Out)) != "dist" {
		return fmt.Errorf("output directory %q must be named dist", cfg.Out)
	}
	if cfg.ReleaseBase == "" {
		cfg.ReleaseBase = "https://github.com/kylebegeman/dossier/releases/download/v" + cfg.Version
	}
	if cfg.Log == nil {
		cfg.Log = io.Discard
	}
	if cfg.Compile == nil {
		cfg.Compile = compile
	}
	return nil
}

// Build writes the whole distribution into cfg.Out.
func Build(ctx context.Context, cfg Config) error {
	if err := cfg.defaults(); err != nil {
		return err
	}
	if err := resetOut(cfg.Out); err != nil {
		return err
	}
	license, err := os.ReadFile(filepath.Join(cfg.Repo, "LICENSE"))
	if err != nil {
		return err
	}
	readme, err := os.ReadFile(filepath.Join(cfg.Repo, "README.md"))
	if err != nil {
		return err
	}
	sums := map[string]string{}
	for _, t := range Targets {
		bin := filepath.Join(cfg.Out, "bin", t.NPM(), t.Exe())
		say(cfg.Log, "build    %s/%s\n", t.GOOS, t.GOARCH)
		if err := os.MkdirAll(filepath.Dir(bin), 0o755); err != nil {
			return err
		}
		if err := cfg.Compile(ctx, cfg, t, bin); err != nil {
			return fmt.Errorf("build %s/%s: %w", t.GOOS, t.GOARCH, err)
		}
		exe, err := os.ReadFile(bin)
		if err != nil {
			return err
		}
		archive := filepath.Join(cfg.Out, t.Archive(cfg.Version))
		entries := []entry{{t.Exe(), exe, 0o755}, {"LICENSE", license, 0o644}, {"README.md", readme, 0o644}}
		if t.GOOS == "windows" {
			err = writeZip(archive, entries)
		} else {
			err = writeTarGz(archive, entries)
		}
		if err != nil {
			return err
		}
		sum, err := fileSHA256(archive)
		if err != nil {
			return err
		}
		sums[t.Archive(cfg.Version)] = sum
		if err := platformPackage(cfg, t, exe, license); err != nil {
			return err
		}
	}
	if err := writeChecksums(filepath.Join(cfg.Out, "checksums.txt"), sums); err != nil {
		return err
	}
	if err := launcherPackage(cfg, license); err != nil {
		return err
	}
	if err := formula(cfg, sums); err != nil {
		return err
	}
	say(cfg.Log, "wrote    %s\n", cfg.Out)
	return nil
}

func resetOut(out string) error {
	entries, err := os.ReadDir(out)
	switch {
	case errors.Is(err, os.ErrNotExist):
	case err != nil:
		return err
	case len(entries) > 0:
		if _, err := os.Stat(filepath.Join(out, marker)); err != nil {
			return fmt.Errorf("%s is not empty and was not written by a release build; remove it first", out)
		}
		if err := os.RemoveAll(out); err != nil {
			return err
		}
	}
	if err := os.MkdirAll(out, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(out, marker), []byte("written by dossier-release; replaced on every build\n"), 0o644)
}

func compile(ctx context.Context, cfg Config, t Target, dst string) error {
	abs, err := filepath.Abs(dst)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, "go", "build", "-trimpath",
		"-ldflags", "-s -w -X dossier/internal/doors.Version="+cfg.Version,
		"-o", abs, "./cmd/dossier")
	cmd.Dir = cfg.Core
	cmd.Env = append(os.Environ(), "CGO_ENABLED=0", "GOOS="+t.GOOS, "GOARCH="+t.GOARCH)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%w: %s", err, strings.TrimSpace(stderr.String()))
	}
	return nil
}

type entry struct {
	name string
	data []byte
	mode int64
}

func writeTarGz(path string, entries []entry) error {
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for _, e := range entries {
		hdr := &tar.Header{Name: e.name, Mode: e.mode, Size: int64(len(e.data)), ModTime: epoch, Typeflag: tar.TypeReg, Format: tar.FormatUSTAR}
		if err := tw.WriteHeader(hdr); err != nil {
			return err
		}
		if _, err := tw.Write(e.data); err != nil {
			return err
		}
	}
	if err := tw.Close(); err != nil {
		return err
	}
	if err := gz.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func writeZip(path string, entries []entry) error {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for _, e := range entries {
		hdr := &zip.FileHeader{Name: e.name, Method: zip.Deflate, Modified: epoch}
		hdr.SetMode(os.FileMode(e.mode))
		w, err := zw.CreateHeader(hdr)
		if err != nil {
			return err
		}
		if _, err := w.Write(e.data); err != nil {
			return err
		}
	}
	if err := zw.Close(); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0o644)
}

func fileSHA256(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func writeChecksums(path string, sums map[string]string) error {
	names := make([]string, 0, len(sums))
	for name := range sums {
		names = append(names, name)
	}
	sort.Strings(names)
	var b strings.Builder
	for _, name := range names {
		b.WriteString(sums[name] + "  " + name + "\n")
	}
	return os.WriteFile(path, []byte(b.String()), 0o644)
}

// platformPackage writes the npm package that carries one target's binary.
func platformPackage(cfg Config, t Target, exe, license []byte) error {
	dir := filepath.Join(cfg.Out, "npm", "dossier-"+t.NPM())
	if err := os.MkdirAll(filepath.Join(dir, "bin"), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "bin", t.Exe()), exe, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(dir, "LICENSE"), license, 0o644); err != nil {
		return err
	}
	platform, cpu, _ := strings.Cut(t.NPM(), "-")
	manifest := orderedJSON{
		{"name", t.Package()},
		{"version", cfg.Version},
		{"description", fmt.Sprintf("The dossier binary for %s %s. Install @kylebegeman/dossier, which picks the right one.", platform, cpu)},
		{"license", "MIT"},
		{"repository", orderedJSON{{"type", "git"}, {"url", "git+https://github.com/kylebegeman/dossier.git"}}},
		{"os", []string{platform}},
		{"cpu", []string{cpu}},
		{"files", []string{"bin", "LICENSE"}},
		{"preferUnplugged", true},
	}
	return writeJSON(filepath.Join(dir, "package.json"), manifest)
}

// launcherPackage copies packages/dossier and stamps the version into it and
// into every optional dependency on a platform package.
func launcherPackage(cfg Config, license []byte) error {
	src := filepath.Join(cfg.Repo, "packages", "dossier")
	dst := filepath.Join(cfg.Out, "npm", "dossier")
	for _, rel := range []string{"bin/dossier.js", "lib/index.js", "lib/index.d.ts", "README.md"} {
		data, err := os.ReadFile(filepath.Join(src, rel))
		if err != nil {
			return err
		}
		mode := os.FileMode(0o644)
		if strings.HasPrefix(rel, "bin/") {
			mode = 0o755
		}
		if err := os.MkdirAll(filepath.Dir(filepath.Join(dst, rel)), 0o755); err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dst, rel), data, mode); err != nil {
			return err
		}
	}
	if err := os.WriteFile(filepath.Join(dst, "LICENSE"), license, 0o644); err != nil {
		return err
	}
	raw, err := os.ReadFile(filepath.Join(src, "package.json"))
	if err != nil {
		return err
	}
	manifest, err := StampLauncher(raw, cfg.Version)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dst, "package.json"), manifest, 0o644)
}

// StampLauncher sets the launcher's version and pins every platform package
// to it, keeping the manifest's key order. It fails when the manifest's
// platform packages do not match Targets.
func StampLauncher(raw []byte, version string) ([]byte, error) {
	var manifest orderedJSON
	if err := json.Unmarshal(raw, &manifest); err != nil {
		return nil, fmt.Errorf("packages/dossier/package.json: %w", err)
	}
	want := map[string]bool{}
	for _, t := range Targets {
		want[t.Package()] = true
	}
	found := 0
	for i, kv := range manifest {
		switch kv.key {
		case "version":
			manifest[i].value = version
		case "optionalDependencies":
			var deps orderedJSON
			b, _ := json.Marshal(kv.value)
			if err := json.Unmarshal(b, &deps); err != nil {
				return nil, err
			}
			for j := range deps {
				if !want[deps[j].key] {
					return nil, fmt.Errorf("optional dependency %s is not a release target", deps[j].key)
				}
				deps[j].value = version
				found++
			}
			manifest[i].value = deps
		}
	}
	if found != len(Targets) {
		return nil, fmt.Errorf("the launcher lists %d platform packages; the release builds %d", found, len(Targets))
	}
	return marshalIndent(manifest)
}

var formulaTemplate = template.Must(template.New("formula").Parse(`# Generated by dossier-release for {{.Version}}. Publish it to the
# kylebegeman/homebrew-tap repository with the matching release assets.
class Dossier < Formula
  desc "Turn one JSON model into one self-contained HTML dossier"
  homepage "https://github.com/kylebegeman/dossier"
  version "{{.Version}}"
  license "MIT"

  on_macos do
    on_arm do
      url "{{.URL "darwin" "arm64"}}"
      sha256 "{{.SHA "darwin" "arm64"}}"
    end
    on_intel do
      url "{{.URL "darwin" "amd64"}}"
      sha256 "{{.SHA "darwin" "amd64"}}"
    end
  end

  on_linux do
    on_arm do
      url "{{.URL "linux" "arm64"}}"
      sha256 "{{.SHA "linux" "arm64"}}"
    end
    on_intel do
      url "{{.URL "linux" "amd64"}}"
      sha256 "{{.SHA "linux" "amd64"}}"
    end
  end

  def install
    bin.install "dossier"
  end

  test do
    assert_match "dossier #{version}", shell_output("#{bin}/dossier --version")
    system bin/"dossier", "init", "brainstorm", "--title", "Brew test", "--out", testpath
    system bin/"dossier", "build", testpath/"brew-test.dossier.json"
    assert_path_exists testpath/"brew-test.html"
  end
end
`))

type formulaData struct {
	Version string
	base    string
	sums    map[string]string
}

func (f formulaData) URL(goos, goarch string) string {
	return f.base + "/" + Target{goos, goarch}.Archive(f.Version)
}

func (f formulaData) SHA(goos, goarch string) string {
	return f.sums[Target{goos, goarch}.Archive(f.Version)]
}

func formula(cfg Config, sums map[string]string) error {
	var b bytes.Buffer
	if err := formulaTemplate.Execute(&b, formulaData{Version: cfg.Version, base: cfg.ReleaseBase, sums: sums}); err != nil {
		return err
	}
	dir := filepath.Join(cfg.Out, "homebrew")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "dossier.rb"), b.Bytes(), 0o644)
}

// orderedJSON is a JSON object that keeps its key order.
type orderedJSON []kv

type kv struct {
	key   string
	value any
}

func (o orderedJSON) MarshalJSON() ([]byte, error) {
	var b bytes.Buffer
	b.WriteByte('{')
	for i, p := range o {
		if i > 0 {
			b.WriteByte(',')
		}
		k, err := json.Marshal(p.key)
		if err != nil {
			return nil, err
		}
		v, err := marshalNoEscape(p.value)
		if err != nil {
			return nil, err
		}
		b.Write(k)
		b.WriteByte(':')
		b.Write(v)
	}
	b.WriteByte('}')
	return b.Bytes(), nil
}

func (o *orderedJSON) UnmarshalJSON(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	if d, ok := tok.(json.Delim); !ok || d != '{' {
		return errors.New("expected a JSON object")
	}
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return err
		}
		key, _ := keyTok.(string)
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return err
		}
		var value any = raw
		if bytes.HasPrefix(bytes.TrimSpace(raw), []byte("{")) {
			var nested orderedJSON
			if err := json.Unmarshal(raw, &nested); err != nil {
				return err
			}
			value = nested
		}
		*o = append(*o, kv{key, value})
	}
	_, err = dec.Token()
	return err
}

func marshalNoEscape(v any) ([]byte, error) {
	if raw, ok := v.(json.RawMessage); ok {
		var decoded any
		if err := json.Unmarshal(raw, &decoded); err != nil {
			return nil, err
		}
		v = decoded
	}
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(b.Bytes(), "\n"), nil
}

func marshalIndent(v any) ([]byte, error) {
	flat, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var b bytes.Buffer
	if err := json.Indent(&b, flat, "", "  "); err != nil {
		return nil, err
	}
	b.WriteByte('\n')
	return b.Bytes(), nil
}

func writeJSON(path string, v any) error {
	data, err := marshalIndent(v)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func say(w io.Writer, format string, args ...any) { _, _ = fmt.Fprintf(w, format, args...) }
