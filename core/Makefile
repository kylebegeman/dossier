# Dossier core: tools are pinned in go.mod (tool directives).

.PHONY: generate check build test clean

generate:
	go tool templ generate >/dev/null
	CGO_ENABLED=0 go tool sqlc generate
	go run ./cmd/dossier skill --write skill/SKILL.md >/dev/null

check:
	@sh scripts/check-generated.sh
	go vet ./...
	go tool staticcheck ./...
	go tool errcheck -ignoregenerated ./...
	go test -race ./...
	CGO_ENABLED=0 go build -o /dev/null ./...

test:
	go test ./...

build: generate
	CGO_ENABLED=0 go build -o bin/dossier ./cmd/dossier

clean:
	rm -rf bin dist
