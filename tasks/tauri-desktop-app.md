# Tauri Desktop App Build Plan for ACC Dashboard

This file is a normalized planning note from an older generated export.

## Reference URLs

- Rust installer: `https://rustup.rs`
- WebView2 docs: `https://developer.microsoft.com/en-us/microsoft-edge/webview2/`
- Tauri schema reference: `https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-cli/schema.json`
- Local Vite example: `http://localhost:5173`
- Local API example: `http://localhost:4000`

## Core Recommendation

- Prefer Tauri over Electron for the desktop shell if the dashboard desktop app is revived.
- Reuse the existing React app in `ui/`.
- Keep local service endpoints as code literals rather than markdown hyperlinks, so doc verification does not fail when local services are offline.

## Note

The previous contents were a partially serialized JSON/blob artifact with malformed markdown and truncated URLs. It has been reduced to a clean planning note so `markdown-link-check` can parse it safely.
