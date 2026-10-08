# BetterCLI for Claude

A desktop app for running many [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) sessions side by side.
Sessions live in tabs, sit in groups, and can be forked with one click; forks nest under the session they came from.

Every tab is the real `claude` terminal UI, so slash commands, skills, MCP servers, hooks and permission prompts all work as they do in your terminal.

> Not affiliated with or endorsed by Anthropic. "Claude" and "Claude Code" are trademarks of Anthropic.

## Features

- **Session tree**: group sessions by task; forks appear as children of their parent.
- **Fork**: start a new session that carries the full history of an existing one. The parent is not touched.
- **Live status**: each session shows whether Claude is working, waiting for you (permission prompt), or idle.
- **Notifications**: a desktop notification (and a flashing taskbar icon) when a session you are not looking at needs input or finishes. Click it to jump to that tab.
- **Image paste**: Ctrl+V (⌘V on macOS) with a screenshot in the clipboard attaches it to the prompt.
- **Your existing sessions**: the "Claude CLI sessions" section lists sessions you ran in a normal terminal; click one to bring it in and continue it.
- **Themes**: Midnight, Nord, Dracula, Solarized Dark, Daylight. The terminal and window title bar follow the theme.

## Requirements

- [Claude Code](https://docs.claude.com/en/docs/claude-code/setup) installed and signed in (`claude` must work in a terminal).
- `curl` on the PATH, used for status updates. It ships with Windows 10+, macOS and most Linux distributions.

## Install

Download from the [latest release](https://github.com/lvyyln/bettercli-for-claude/releases/latest).

| OS | File | Notes |
|---|---|---|
| Windows | `BetterCLI-x.y.z-setup.exe` | Installer for x64 and ARM64. `-setup-x64` / `-setup-arm64` are smaller single-architecture installers. |
| Windows | `BetterCLI-x.y.z-portable.exe` | No install; run from anywhere. |
| Windows | `BetterCLI-x.y.z-win-x64.zip` | Unzip and run. |
| macOS | `BetterCLI-x.y.z-mac-arm64.dmg` / `-mac-x64.dmg` | Apple Silicon / Intel. |
| Linux | `.AppImage`, `.deb`, `.tar.gz` | x64. |

**The builds are not code-signed yet.**

- Windows: SmartScreen may show "Windows protected your PC". Click *More info* → *Run anyway*.
- macOS: if the app is reported as damaged or from an unidentified developer, run `xattr -cr "/Applications/BetterCLI for Claude.app"` once, then open it.

## Usage

- **New session**: `+` in the sidebar. Pick a title, a group and a working directory.
- **Fork**: hover a session and click the fork icon, or use *Fork* in the header.
- **Edit**: rename, move to another group, or remove from the sidebar. Removing never deletes the conversation from `~/.claude/projects`.
- Closing a tab stops that Claude process. Click the session again to resume it.
- With the Daylight theme, also run `/theme` inside Claude and choose a light theme, since Claude draws its own colors.

### Keyboard shortcuts

Tab actions use Ctrl+Shift on Windows and Linux (like Windows Terminal), so plain Ctrl shortcuts such as Ctrl+T and Ctrl+W still reach Claude.

| Action | Windows / Linux | macOS |
|---|---|---|
| New session | Ctrl+Shift+T | ⌘T |
| Close tab | Ctrl+Shift+W | ⌘W |
| Fork current session | Ctrl+Shift+D | ⌘D |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab | Ctrl+Tab / Ctrl+Shift+Tab |
| Go to tab 1–8 / last tab | Ctrl+1…8 / Ctrl+9 | ⌘1…8 / ⌘9 |
| Font size bigger / smaller / reset | Ctrl+= / Ctrl+- / Ctrl+0 | ⌘= / ⌘- / ⌘0 |
| Paste text or image | Ctrl+V or Ctrl+Shift+V | ⌘V |
| Copy selection | Ctrl+C (with text selected) | ⌘C |
| New line in the prompt | Shift+Enter | Shift+Enter |

## How it works

- Each tab runs `claude` in a pseudo-terminal (node-pty) rendered with xterm.js.
- New session: `claude --session-id <uuid> -n <title>`
- Fork: `claude --resume <parent> --fork-session --session-id <uuid> -n <title>`
- Reopen: `claude --resume <id>`
- Status comes from Claude Code hooks passed per session with `--settings`; your own settings files are not modified. Each hook posts its JSON payload to a local port with `curl`.
- Sidebar data (titles, groups, parents) is stored in the app data folder (`desk.json`). Conversations stay where Claude Code keeps them, in `~/.claude/projects`.

## Build from source

```
npm install
npm start            # run in development
npm run dist:win     # or dist:mac / dist:linux; output in dist/
npm run icon         # re-render build/icon.png from build/icon.svg
```

macOS packages must be built on macOS. Linux needs a C++ toolchain and Python so node-pty can compile.

## Releasing

1. Bump `version` in `package.json`.
2. Push a matching tag: `git tag v0.2.0 && git push origin v0.2.0`.
3. GitHub Actions builds Windows, macOS and Linux and uploads everything to a draft release. Review it and publish.

## License

[MIT](LICENSE)
