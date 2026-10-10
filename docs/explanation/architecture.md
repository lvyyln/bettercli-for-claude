# Architecture

BetterCLI is a small Electron app, about 2,000 lines of plain JavaScript with no framework and no build step. This page explains how its parts fit together and why they are shaped this way.

## The core idea: wrap the real CLI

The app does not reimplement Claude Code's interface. Every tab runs the real `claude` program in a pseudo-terminal and shows its output in a terminal emulator. Slash commands, skills, MCP servers, permission prompts and your own hooks all work because they are just Claude Code doing what it normally does.

The app adds things *around* the CLI: a sidebar that remembers sessions, one-click forks, a live status per session, and a panel listing changed files. It gets the information it needs for those from three places, all public:

- **Command-line flags** to start, resume and fork sessions (`--session-id`, `--resume`, `--fork-session`, `-n`).
- **Hooks**, passed with `--settings`, to learn what each session is doing.
- **Transcript files** in `~/.claude/projects`, to find sessions that already exist.

This keeps the app thin. When Claude Code gains a feature, it shows up in BetterCLI with no change.

## Processes

```
┌──────────────────────── Main process (src/main.js) ─────────────────────────┐
│  desk.json store   Hook server (127.0.0.1:random)   changes.js   log.js      │
│        │                    ▲                                                │
│        │          node-pty  │ curl POST per hook event                       │
│        │         ┌──────────┴──────────┐                                     │
│        │         │ claude  (session A) │   one pty per open tab              │
│        │         │ claude  (session B) │                                     │
│        │         └─────────────────────┘                                     │
└────────┼────────────────────▲────────────────────────────────────────────────┘
         │ IPC (window.desk)   │
┌────────▼─────────────────────┴──── Renderer (src/renderer/) ────────────────┐
│  Sidebar tree   Tabs   xterm.js terminal per tab   Changes panel             │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Main process

`src/main.js` owns everything that touches the system:

- the window
- `desk.json`, the list of sessions
- one `node-pty` process per open tab
- a small HTTP server on `127.0.0.1` that receives hook events
- change tracking (`src/changes.js`) and logging (`src/log.js`)

### Renderer

`src/renderer/` is a single page with no framework. `renderer.js` keeps a `state` object and redraws the sidebar, tabs, header and Changes panel from it with `render()`. Each open tab has its own xterm.js terminal; switching tabs shows one and hides the others, so a session's scrollback survives switching.

### Preload bridge

The renderer cannot use Node or Electron directly. `src/preload.js` exposes a fixed set of functions as `window.desk`, each mapped to one IPC channel. Everything the page can do is listed in the [IPC API reference](../reference/ipc-api.md). This keeps the page, which displays untrusted terminal output, away from the file system and process APIs.

## A keystroke's round trip

1. You type in a tab. xterm.js calls `desk.write(id, data)`.
2. The main process writes the data to that session's pty.
3. `claude` reacts and writes output to the pty.
4. The main process forwards the output as a `pty:data` event.
5. The renderer writes it into that tab's terminal.

App shortcuts are caught before step 1, in a capture-phase key listener, so they never reach Claude.

## Where state lives

| State | Where | Why there |
|---|---|---|
| Sessions, groups, parents | `desk.json` in the app data folder | Needs to survive restarts; small; owned by the app. |
| Conversations | `~/.claude/projects` | Owned by Claude Code. The app only reads it. |
| Running processes, statuses | Memory in the main process | Only meaningful while the app runs. Everything starts `stopped`. |
| Change baselines | `changes/<id>.json` | Must survive restarts so diffs stay correct across sessions. |
| Theme, font size, panel open | Renderer local storage | Pure display preferences. |

Keeping conversations entirely in Claude Code's hands is deliberate: removing a session from the sidebar, uninstalling the app or losing `desk.json` never loses a conversation. You can always resume it from a terminal, or bring it back through **Claude CLI sessions**.

## Startup order

1. Set the Windows app ID (used by notifications) and, when run from source, switch to the **(dev)** data folder.
2. Start the log and Electron's crash reporter (local only).
3. Take the single-instance lock. A second copy hands focus to the first and quits.
4. On macOS and Linux, load `PATH` from the login shell.
5. Load `desk.json`, set up change tracking.
6. Start the hook server on a random free port, then write `hooks.json` with that port.
7. Register IPC handlers, create the window, load the page.

Step 6 comes before any session can start, so every session gets the current port.

## Related

- [How status works](status-via-hooks.md)
- [Forks and the session tree](forks-and-the-session-tree.md)
- [How change tracking works](change-tracking.md)
