package release

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"dossier/internal/doors"
)

func fakeCompile(_ context.Context, _ Config, t Target, dst string) error {
	return os.WriteFile(dst, []byte("binary for "+t.GOOS+"/"+t.GOARCH), 0o755)
}

func fakeNotices(_ context.Context, _ Config) ([]byte, error) {
	return []byte("# Third-party notices\n"), nil
}

func testConfig(t *testing.T) Config {
	t.Helper()
	return Config{Version: "9.8.7", Core: "../..", Repo: "../../..", Out: filepath.Join(t.TempDir(), "dist"), Compile: fakeCompile, Notices: fakeNotices}
}

func TestBuildWritesTheDistribution(t *testing.T) {
	cfg := testConfig(t)
	if err := Build(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}
	for _, rel := range []string{
		"dossier_9.8.7_darwin_arm64.tar.gz", "dossier_9.8.7_linux_amd64.tar.gz", "dossier_9.8.7_windows_amd64.zip",
		"checksums.txt", "homebrew/dossier.rb",
		"npm/dossier/package.json", "npm/dossier/bin/dossier.js", "npm/dossier/lib/index.js", "npm/dossier/LICENSE",
		"npm/dossier-darwin-arm64/bin/dossier", "npm/dossier-win32-x64/bin/dossier.exe", "npm/dossier-linux-x64/package.json", "npm/dossier-linux-x64/THIRD_PARTY_NOTICES.md",
	} {
		if _, err := os.Stat(filepath.Join(cfg.Out, rel)); err != nil {
			t.Errorf("missing %s", rel)
		}
	}
	sums, _ := os.ReadFile(filepath.Join(cfg.Out, "checksums.txt"))
	if strings.Count(string(sums), "\n") != len(Targets) {
		t.Errorf("checksums:\n%s", sums)
	}
	if err := checkSums(cfg); err != nil {
		t.Error(err)
	}

	var platform map[string]any
	data, _ := os.ReadFile(filepath.Join(cfg.Out, "npm", "dossier-win32-x64", "package.json"))
	if err := json.Unmarshal(data, &platform); err != nil {
		t.Fatal(err)
	}
	if platform["name"] != "@kylebegeman/dossier-win32-x64" || platform["version"] != "9.8.7" || platform["os"].([]any)[0] != "win32" || platform["cpu"].([]any)[0] != "x64" {
		t.Errorf("platform package: %v", platform)
	}

	var launcher struct {
		Version  string            `json:"version"`
		Optional map[string]string `json:"optionalDependencies"`
	}
	data, _ = os.ReadFile(filepath.Join(cfg.Out, "npm", "dossier", "package.json"))
	if err := json.Unmarshal(data, &launcher); err != nil {
		t.Fatal(err)
	}
	if launcher.Version != "9.8.7" || len(launcher.Optional) != len(Targets) {
		t.Errorf("launcher: %+v", launcher)
	}
	for name, v := range launcher.Optional {
		if v != "9.8.7" {
			t.Errorf("%s pinned to %s", name, v)
		}
	}
	if !strings.HasPrefix(string(data), "{\n  \"name\": \"@kylebegeman/dossier\",\n  \"version\": \"9.8.7\",") {
		t.Errorf("stamping must keep the manifest's key order:\n%s", data[:120])
	}

	formula, _ := os.ReadFile(filepath.Join(cfg.Out, "homebrew", "dossier.rb"))
	sumLine := strings.Fields(strings.Split(string(sums), "\n")[0])
	for _, want := range []string{"releases/download/v9.8.7/dossier_9.8.7_darwin_arm64.tar.gz", `sha256 "` + sumLine[0] + `"`, `bin.install "dossier"`} {
		if !strings.Contains(string(formula), want) {
			t.Errorf("formula lacks %q", want)
		}
	}
	// Homebrew reads the version from the archive names, and its audit
	// rejects a version stanza that repeats it.
	if strings.Contains(string(formula), "\n  version ") {
		t.Error("the formula must not state the version its URLs carry")
	}
}

func TestArchivesAreDeterministicAndLaidOut(t *testing.T) {
	a, b := testConfig(t), testConfig(t)
	if err := Build(context.Background(), a); err != nil {
		t.Fatal(err)
	}
	if err := Build(context.Background(), b); err != nil {
		t.Fatal(err)
	}
	sa, _ := os.ReadFile(filepath.Join(a.Out, "checksums.txt"))
	sb, _ := os.ReadFile(filepath.Join(b.Out, "checksums.txt"))
	if string(sa) != string(sb) {
		t.Error("two builds of the same binaries must produce the same archives")
	}
	f, err := os.Open(filepath.Join(a.Out, "dossier_9.8.7_linux_arm64.tar.gz"))
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = f.Close() }()
	gz, err := gzip.NewReader(f)
	if err != nil {
		t.Fatal(err)
	}
	tr := tar.NewReader(gz)
	var names []string
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		names = append(names, hdr.Name)
		if hdr.Name == "dossier" && hdr.Mode != 0o755 {
			t.Errorf("binary mode %o", hdr.Mode)
		}
	}
	if strings.Join(names, ",") != "dossier,LICENSE,THIRD_PARTY_NOTICES.md,README.md" {
		t.Errorf("archive entries: %v", names)
	}
	dir := t.TempDir()
	if err := extract(filepath.Join(a.Out, "dossier_9.8.7_windows_arm64.zip"), dir); err != nil {
		t.Fatal(err)
	}
	if data, _ := os.ReadFile(filepath.Join(dir, "dossier.exe")); string(data) != "binary for windows/arm64" {
		t.Errorf("zip extraction: %q", data)
	}
}

func TestBuildGuardsTheOutputDirectory(t *testing.T) {
	cfg := testConfig(t)
	cfg.Out = filepath.Join(t.TempDir(), "elsewhere")
	if err := Build(context.Background(), cfg); err == nil {
		t.Error("an output directory not named dist must be refused")
	}
	cfg = testConfig(t)
	if err := os.MkdirAll(cfg.Out, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(cfg.Out, "keep.txt"), []byte("mine"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := Build(context.Background(), cfg); err == nil {
		t.Error("a dist directory the release did not write must not be replaced")
	}
	cfg.Version = "latest"
	if err := Build(context.Background(), cfg); err == nil {
		t.Error("a version that is not semantic must be refused")
	}
}

// TestVersionsAgree keeps VERSION, the binary's default version, and both
// npm packages on one version.
func TestVersionsAgree(t *testing.T) {
	raw, err := os.ReadFile("../../VERSION")
	if err != nil {
		t.Fatal(err)
	}
	version := strings.TrimSpace(string(raw))
	if doors.Version != version+"-dev" {
		t.Errorf("doors.Version is %q; VERSION is %s", doors.Version, version)
	}
	for _, pkg := range []string{"../../../packages/dossier/package.json", "../../../packages/react/package.json"} {
		data, err := os.ReadFile(pkg)
		if err != nil {
			t.Fatal(err)
		}
		var manifest struct {
			Version    string `json:"version"`
			Repository struct {
				URL string `json:"url"`
			} `json:"repository"`
		}
		if err := json.Unmarshal(data, &manifest); err != nil {
			t.Fatal(err)
		}
		if manifest.Version != version {
			t.Errorf("%s is %s; VERSION is %s", pkg, manifest.Version, version)
		}
		// npm refuses a provenance publish unless the repository matches the
		// one that built it.
		if manifest.Repository.URL != "git+https://github.com/kylebegeman/dossier.git" {
			t.Errorf("%s names repository %q", pkg, manifest.Repository.URL)
		}
	}
	data, _ := os.ReadFile("../../../packages/dossier/package.json")
	if _, err := StampLauncher(data, version); err != nil {
		t.Errorf("the launcher's platform packages must match the targets: %v", err)
	}
}

func TestTargetNames(t *testing.T) {
	for target, want := range map[Target]string{{"darwin", "arm64"}: "darwin-arm64", {"linux", "amd64"}: "linux-x64", {"windows", "amd64"}: "win32-x64"} {
		if got := target.NPM(); got != want {
			t.Errorf("%v: %s", target, got)
		}
	}
}

func TestNoticesCoverEveryLinkedModule(t *testing.T) {
	if testing.Short() {
		t.Skip("lists dependencies for every target")
	}
	cfg := testConfig(t)
	notices, err := Notices(context.Background(), cfg)
	if err != nil {
		t.Fatal(err)
	}
	text := string(notices)
	for _, want := range []string{
		"## github.com/goccy/go-graphviz v0.2.10\n\nVendored in core/third_party with Dossier's patch",
		"## github.com/tetratelabs/wazero ",
		"## github.com/yuin/goldmark ",
		"## modernc.org/sqlite ",
		"## The Go standard library and runtime",
		"## Licenses of code inside graphviz.wasm",
		"## Licenses of the studio's CodeMirror bundle",
		"### @codemirror/view/LICENSE",
		"### graphviz/epl-v10.txt",
		"Eclipse Public License - v 1.0",
		"### expat/COPYING",
		"### wasi-libc/musl-COPYRIGHT",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("notices lack %q", want)
		}
	}
	for _, gone := range []string{"## dossier ", "github.com/fogleman/gg", "github.com/golang/freetype"} {
		if strings.Contains(text, gone) {
			t.Errorf("notices list %q, which the binary does not link", gone)
		}
	}
}
