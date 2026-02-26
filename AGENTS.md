# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

BlockGame (方寸枢机) is a multiplayer pixel-block party game built with **Tauri 2** (Rust backend + vanilla HTML/JS/CSS frontend). Up to 8 players connect via phone browsers as controllers over LAN WebSocket. See `笔记.md` for the original author's build/run notes.

### Architecture

Single Tauri desktop process with an embedded Axum HTTP/WebSocket server on port `8088`. The frontend in `dist/` is pre-built static files (no Node.js build step). There is no database; game data persists via XOR-encrypted `.sav` files.

### Running the Application

```
cargo tauri dev
```

This builds the Rust backend in debug mode and opens the Tauri WebView window. The embedded server starts automatically on `0.0.0.0:8088`.

### Lint and Test

- **Lint:** `cargo clippy` (run from `src-tauri/`). There are 2 pre-existing clippy warnings (`derivable_impls`, `collapsible_if`) in `main.rs`.
- **Test:** `cargo test` (run from `src-tauri/`). Currently 0 tests defined.

### System Dependencies (Linux / Ubuntu 24.04)

Tauri 2 requires these system packages (installed via `apt`):

`libwebkit2gtk-4.1-dev`, `libxdo-dev`, `libssl-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `patchelf`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libjavascriptcoregtk-4.1-dev`

### Non-obvious Gotchas

- The default Rust version on the VM (1.83) is too old for `tauri-cli ^2`. You must run `rustup default stable` to switch to a recent stable toolchain before installing/using Tauri CLI.
- `cargo tauri dev` working directory must be the repo root (`/workspace`), not `src-tauri/`.
- The app defaults to fullscreen mode on first launch. In the Cloud VM, you can interact with the game via Chrome at `http://localhost:8088/` as an alternative to the native Tauri window.
- The controller page at `http://localhost:8088/controller.html` connects via WebSocket and automatically allocates a player ID.
