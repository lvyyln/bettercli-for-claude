# Security notes

BetterCLI runs Claude Code, which can read and change files and run commands. The app itself adds very little on top. This page describes what it does and does not expose, so you can judge it.

## The app runs Claude Code as you

Each session is the normal `claude` program, running as your user, in the folder you chose. Its permissions, permission prompts and your own settings apply exactly as in a terminal. The app does not grant extra permissions, skip prompts, or pass flags such as `--dangerously-skip-permissions`.

## Terminal output is treated as untrusted

Claude's output can contain text from files, web pages and command results, so the page that displays it is locked down:

- **No Node access in the page.** The window runs with `contextIsolation: true` and `nodeIntegration: false`. The page can only call the fixed functions in `window.desk`.
- **Content Security Policy.** The page may only load scripts and other resources from the app itself (`default-src 'self'`). Inline styles are allowed; inline scripts are not.
- **Links need a deliberate click.** Links in terminal output open only on <kbd>Ctrl</kbd>+click (<kbd>⌘</kbd>+click), and only `http:`, `https:` and `mailto:` links are handed to the OS. Links such as `file:` or custom app schemes are refused.
- **No new windows.** Any attempt to open a window from the page is denied; allowed links go to your default browser instead.
- **Text is escaped.** Session titles, paths and diff lines are escaped before being placed in the page.

## The local status server

The app listens on `127.0.0.1` on a random port to receive hook events. It is not reachable from the network. Other programs on the same machine could send it fake events, but only for a session ID that is currently running in the app. A fake event can change that session's status dot, or make the app save a copy of a file it names (up to 1 MB) into that session's change record. The app can only read files your own user can read. The server never runs anything it receives.

## Data stays on your machine

- The app makes no network requests of its own. Claude Code talks to Anthropic as it normally does.
- Crash reports are written locally and **not uploaded** (`uploadToServer: false`).
- Logs are written locally. They contain session IDs, titles, folder paths and error messages, not conversation content.
- Change records contain copies of the original content of files Claude edited, up to 1 MB each. They are in the app data folder and are deleted when you remove the session from the sidebar. Treat them like the files themselves.
- Pasted images are written to the system temporary folder and not deleted by the app.

## Unsigned builds

Release builds are not code-signed yet, which is why Windows and macOS warn about them. If that matters to you, [build from source](../how-to/build-from-source.md) and check the release workflow (`.github/workflows/release.yml`), which builds every release on GitHub's own runners from the tagged commit.

## Reporting a problem

If you find a security issue, report it privately to the maintainer through GitHub rather than in a public issue.
