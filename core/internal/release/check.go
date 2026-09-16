package release

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const stepTimeout = 3 * time.Minute

// Check dry-runs a built distribution without publishing anything: archives
// match their checksums, the host archive passes the Homebrew formula's test
// commands, the formula parses as Ruby, every npm package packs the files it
// must carry, and the launcher installs from local tarballs and runs.
func Check(ctx context.Context, cfg Config) error {
	if err := cfg.defaults(); err != nil {
		return err
	}
	host := Target{runtime.GOOS, runtime.GOARCH}
	known := false
	for _, t := range Targets {
		known = known || t == host
	}
	if !known {
		return fmt.Errorf("%s/%s is not a release target, so it cannot be checked here", host.GOOS, host.GOARCH)
	}
	work, err := os.MkdirTemp("", "dossier-release-check-")
	if err != nil {
		return err
	}
	defer func() { _ = os.RemoveAll(work) }()

	if err := checkSums(cfg); err != nil {
		return err
	}
	say(cfg.Log, "ok       checksums match %d archives\n", len(Targets))

	extracted := filepath.Join(work, "archive")
	if err := extract(filepath.Join(cfg.Out, host.Archive(cfg.Version)), extracted); err != nil {
		return err
	}
	if err := runsLikeTheFormulaTest(ctx, cfg, filepath.Join(extracted, host.Exe()), filepath.Join(work, "formula-test")); err != nil {
		return fmt.Errorf("host archive: %w", err)
	}
	say(cfg.Log, "ok       %s runs the Homebrew test commands\n", host.Archive(cfg.Version))

	if ruby, err := exec.LookPath("ruby"); err == nil {
		if _, err := command(ctx, "", ruby, "-c", filepath.Join(cfg.Out, "homebrew", "dossier.rb")); err != nil {
			return fmt.Errorf("formula: %w", err)
		}
		say(cfg.Log, "ok       homebrew/dossier.rb parses\n")
	} else {
		say(cfg.Log, "skip     homebrew/dossier.rb syntax: ruby not found\n")
	}

	npm, err := exec.LookPath("npm")
	if err != nil {
		say(cfg.Log, "skip     npm packages: npm not found\n")
		return nil
	}
	packages := map[string][]string{filepath.Join(cfg.Out, "npm", "dossier"): {"package.json", "bin/dossier.js", "lib/index.js", "lib/index.d.ts", "README.md", "LICENSE"}}
	for _, t := range Targets {
		packages[filepath.Join(cfg.Out, "npm", "dossier-"+t.NPM())] = []string{"package.json", "bin/" + t.Exe(), "LICENSE", NoticesFile}
	}
	tarballs := map[string]string{}
	for dir, want := range packages {
		out, err := command(ctx, dir, npm, "pack", "--json", "--pack-destination", work)
		if err != nil {
			return fmt.Errorf("npm pack %s: %w", dir, err)
		}
		var packed []struct {
			Filename string `json:"filename"`
			Files    []struct {
				Path string `json:"path"`
			} `json:"files"`
		}
		if err := json.Unmarshal(out, &packed); err != nil || len(packed) != 1 {
			return fmt.Errorf("npm pack %s: unexpected output: %v", dir, err)
		}
		have := map[string]bool{}
		for _, f := range packed[0].Files {
			have[f.Path] = true
		}
		for _, f := range want {
			if !have[f] {
				return fmt.Errorf("npm pack %s: %s is missing from the package", dir, f)
			}
		}
		if len(have) != len(want) {
			return fmt.Errorf("npm pack %s: packs %d files, expected exactly %v", dir, len(have), want)
		}
		tarballs[filepath.Base(dir)] = filepath.Join(work, packed[0].Filename)
	}
	say(cfg.Log, "ok       %d npm packages pack their files\n", len(packages))

	project := filepath.Join(work, "project")
	if err := os.MkdirAll(project, 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(project, "package.json"), []byte(`{"name":"dossier-release-check","private":true}`+"\n"), 0o644); err != nil {
		return err
	}
	if _, err := command(ctx, project, npm, "install", "--offline", "--omit=optional", "--no-audit", "--no-fund", "--ignore-scripts",
		tarballs["dossier-"+host.NPM()], tarballs["dossier"]); err != nil {
		return fmt.Errorf("npm install from tarballs: %w", err)
	}
	launcher := filepath.Join(project, "node_modules", ".bin", "dossier")
	if runtime.GOOS == "windows" {
		launcher += ".cmd"
	}
	out, err := command(ctx, project, launcher, "--version")
	if err != nil {
		return fmt.Errorf("installed launcher: %w", err)
	}
	if got := strings.TrimSpace(string(out)); got != "dossier "+cfg.Version {
		return fmt.Errorf("installed launcher reports %q, want %q", got, "dossier "+cfg.Version)
	}
	say(cfg.Log, "ok       npm install from tarballs runs dossier %s\n", cfg.Version)
	return nil
}

func checkSums(cfg Config) error {
	f, err := os.Open(filepath.Join(cfg.Out, "checksums.txt"))
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	listed := map[string]string{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		sum, name, ok := strings.Cut(sc.Text(), "  ")
		if !ok {
			return fmt.Errorf("checksums.txt: malformed line %q", sc.Text())
		}
		listed[name] = sum
	}
	if err := sc.Err(); err != nil {
		return err
	}
	for _, t := range Targets {
		name := t.Archive(cfg.Version)
		sum, err := fileSHA256(filepath.Join(cfg.Out, name))
		if err != nil {
			return err
		}
		if listed[name] != sum {
			return fmt.Errorf("checksums.txt: %s does not match its archive", name)
		}
	}
	if len(listed) != len(Targets) {
		return fmt.Errorf("checksums.txt lists %d archives, expected %d", len(listed), len(Targets))
	}
	return nil
}

// runsLikeTheFormulaTest runs the commands the Homebrew formula's test block
// runs, against an extracted binary.
func runsLikeTheFormulaTest(ctx context.Context, cfg Config, bin, dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	out, err := command(ctx, dir, bin, "--version")
	if err != nil {
		return err
	}
	if got := strings.TrimSpace(string(out)); got != "dossier "+cfg.Version {
		return fmt.Errorf("--version reports %q, want %q", got, "dossier "+cfg.Version)
	}
	if _, err := command(ctx, dir, bin, "init", "brainstorm", "--title", "Brew test", "--out", dir); err != nil {
		return err
	}
	if _, err := command(ctx, dir, bin, "build", filepath.Join(dir, "brew-test.dossier.json")); err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(dir, "brew-test.html")); err != nil {
		return err
	}
	return nil
}

func command(ctx context.Context, dir, name string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, stepTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%s %s: %w: %s", filepath.Base(name), strings.Join(args, " "), err, strings.TrimSpace(stderr.String()))
	}
	return stdout.Bytes(), nil
}

// extract unpacks a release archive, refusing entries that would escape dir.
func extract(archive, dir string) error {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	write := func(name string, mode os.FileMode, r io.Reader) error {
		target := filepath.Join(dir, filepath.Clean("/" + name)[1:])
		if !strings.HasPrefix(target, filepath.Clean(dir)+string(os.PathSeparator)) {
			return fmt.Errorf("%s: entry %q escapes the archive", archive, name)
		}
		f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
		if err != nil {
			return err
		}
		if _, err := io.Copy(f, io.LimitReader(r, 256<<20)); err != nil {
			_ = f.Close()
			return err
		}
		return f.Close()
	}
	if strings.HasSuffix(archive, ".zip") {
		zr, err := zip.OpenReader(archive)
		if err != nil {
			return err
		}
		defer func() { _ = zr.Close() }()
		for _, f := range zr.File {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			err = write(f.Name, f.Mode().Perm(), rc)
			_ = rc.Close()
			if err != nil {
				return err
			}
		}
		return nil
	}
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if hdr.Typeflag != tar.TypeReg {
			return fmt.Errorf("%s: entry %q is not a regular file", archive, hdr.Name)
		}
		if err := write(hdr.Name, os.FileMode(hdr.Mode).Perm(), tr); err != nil {
			return err
		}
	}
}
