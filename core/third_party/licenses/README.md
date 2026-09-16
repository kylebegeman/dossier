# Licenses of code inside graphviz.wasm

go-graphviz v0.2.10 embeds `graphviz.wasm`, a WebAssembly build of C libraries
that Dossier's binary carries for rendering diagrams. Their licenses are kept
here, because no Go module holds them. The release tooling appends every file
in this directory to `THIRD_PARTY_NOTICES.md`.

| Component | Version | License | Source |
| --- | --- | --- | --- |
| Graphviz | 12.1.2 | Eclipse Public License 1.0 | https://gitlab.com/graphviz/graphviz/-/tree/12.1.2 |
| Expat | 2.6.3 | MIT | https://github.com/libexpat/libexpat/tree/R_2_6_3 |
| wasi-libc | wasi-sdk-24 | Apache 2.0 with LLVM exceptions, Apache 2.0, or MIT, with MIT musl and BSD-2-Clause cloudlibc parts | https://github.com/WebAssembly/wasi-libc/tree/wasi-sdk-24 |

The build recipe is in go-graphviz's `internal/wasm/build` directory:
https://github.com/goccy/go-graphviz/tree/v0.2.10/internal/wasm/build
