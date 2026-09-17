# Dossier core: tools are pinned in go.mod (tool directives).

.PHONY: generate check build test clean dist dist-check site

generate:
	go tool templ generate >/dev/null
	CGO_ENABLED=0 go tool sqlc generate
	go run ./cmd/dossier skill --write skill/SKILL.md >/dev/null
	go run ./cmd/dossier types --write ../packages/react/src/model.ts >/dev/null

check:
	@sh scripts/check-generated.sh
	@bash scripts/graphviz/check.sh
	@test -z "$$(gofmt -l cmd internal)" || (echo "Go source is not formatted:"; gofmt -l cmd internal; exit 1)
	go vet ./...
	go tool staticcheck ./...
	go tool errcheck -ignoregenerated ./...
	go test -race ./...
	CGO_ENABLED=0 go build -o /dev/null ./...

test:
	go test ./...

build: generate
	CGO_ENABLED=0 go build -o bin/dossier ./cmd/dossier

# dist cross-compiles every target and writes archives, checksums, the npm
# packages, and the Homebrew formula into dist/. dist-check dry-runs them.
# Neither publishes anything.
dist:
	go run ./cmd/dossier-release build --out dist

dist-check: dist
	go run ./cmd/dossier-release check --out dist

# site builds the Pages site into ../site: the index in ../docs/site and every
# showcase document, the way .github/workflows/pages.yml publishes it. The
# winter crossing brainstorm led the 0.7.0 showcase and is now a test
# fixture; it still builds, unlisted, so links to it keep working.
site:
	rm -rf ../site
	go run ./cmd/dossier build ../docs/site/index.dossier.json examples/*.dossier.json testdata/fixtures/winter-crossing.dossier.json --out ../site
	touch ../site/.nojekyll

clean:
	rm -rf bin dist
