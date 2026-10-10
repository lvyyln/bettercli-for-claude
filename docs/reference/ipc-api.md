# IPC API

The page talks to the main process only through `window.desk`, which `src/preload.js` exposes with `contextBridge`. Each method maps to one IPC channel handled in `registerIpc()` in `src/main.js`.

- **invoke** methods return a Promise with the handler's result.
- **send** methods are fire-and-forget.
- **on** methods subscribe to events pushed from the main process.

## Properties

| Property | Type | Value |
|---|---|---|
| `desk.platform` | string | `process.platform`: `win32`, `darwin` or `linux`. |

## Sessions

| Method | Channel | Kind | Arguments | Returns |
|---|---|---|---|---|
| `getState()` | `state:get` | invoke | | `{ sessions, statuses }`: every session in `desk.json`, and a map of session ID → status (`stopped` if not running). |
| `getHistory()` | `history:get` | invoke | | Up to 40 `{ id, cwd, title, mtime }` for transcripts in `~/.claude/projects` that are not in the sidebar, newest first. |
| `createSession(fields)` | `session:create` | invoke | `{ title, group, cwd }` | The new session, with `pending: "new"`. Rejects with `Folder not found: <cwd>` if `cwd` is not an existing folder. |
| `forkSession(parentId)` | `session:fork` | invoke | parent session ID | The new session: title `Fork of <parent title>`, same group and `cwd` as the parent, `pending: "fork"`. |
| `importSession(fields)` | `session:import` | invoke | `{ id, title, cwd }` | The new session, in group `Imported`. |
| `updateSession(fields)` | `session:update` | invoke | `{ id, title, group }` | The updated session. |
| `removeSession(id)` | `session:remove` | invoke | session ID | Nothing. Kills the process, moves children up to the removed session's parent, deletes the change record. |

All session-changing calls save `desk.json` before returning. Session objects have the fields listed in [desk.json](files-and-folders.md#deskjson).

## Terminal

| Method | Channel | Kind | Arguments | Returns |
|---|---|---|---|---|
| `openPty(id, cols, rows)` | `pty:open` | invoke | session ID, size | Nothing on success, or `{ error }` with a message to show in the terminal. Does nothing if the session is already running. |
| `killPty(id)` | `pty:kill` | invoke | session ID | Nothing. |
| `write(id, data)` | `pty:write` | send | session ID, string | Writes keystrokes to the process. Ignored if not running. |
| `resize(id, cols, rows)` | `pty:resize` | send | session ID, size | Ignored if not running. |
| `readPaste()` | `clipboard:paste` | invoke | | `{ imagePath }` if the clipboard holds a PNG (saved to a temp file), otherwise `{ text }`. |

## Changes panel

| Method | Channel | Kind | Arguments | Returns |
|---|---|---|---|---|
| `listChanges(id)` | `changes:list` | invoke | session ID | Array of `{ path, rel, status, added, removed }` for files that differ from their baseline. |
| `diffChange(id, file)` | `changes:diff` | invoke | session ID, absolute path | `{ path, rel, status, added, removed, hunks, note? }`. `hunks` come from `structuredPatch` in the `diff` package, with 3 lines of context. `note` is `Binary file` or `File too large to diff`. |
| `openFile(file)` | `changes:open` | invoke | absolute path | Result of `shell.openPath`: an empty string on success, otherwise an error message. |

`status` is `added`, `modified` or `deleted`. `rel` is the path relative to the session's `cwd`, or the absolute path if the file is outside it.

## Window and misc

| Method | Channel | Kind | Arguments | Effect |
|---|---|---|---|---|
| `pickDir()` | `dialog:pickDir` | invoke | | Opens a folder picker. Returns the path, or `null` if cancelled. |
| `setTitleBar(colors)` | `theme:titlebar` | send | `{ color, symbolColor }` | Sets the window background colour and, on Windows and Linux, the title bar overlay colours. |
| `setActive(id)` | `session:active` | send | session ID or `null` | Tells the main process which session is in view, for [notifications](session-statuses.md#notifications). |
| `openLink(url)` | `link:open` | send | URL | Opens it in the default browser if the scheme is `http:`, `https:` or `mailto:`. Anything else is logged and ignored. |
| `logError(message)` | `log:error` | send | string | Writes an `[error] renderer …` line to the log. |

## Events

| Method | Channel | Payload | Sent when |
|---|---|---|---|
| `onData(cb)` | `pty:data` | `{ id, data }` | The process writes output. |
| `onExit(cb)` | `pty:exit` | `{ id, exitCode }` | The process exits. Not sent for a process that was replaced by a newer one for the same session. |
| `onStatus(cb)` | `status` | `{ id, status }` | A session's status is set (sent even when unchanged). |
| `onChanges(cb)` | `changes:updated` | `{ id }` | A `PostToolUse` hook for an edit tool arrives. |
| `onFocusSession(cb)` | `session:focus` | `{ id }` | The user clicks a desktop notification. |

## Adding a call

1. Add an `ipcMain.handle` (for a result) or `ipcMain.on` (fire-and-forget) in `registerIpc()` in `src/main.js`.
2. Expose it on `window.desk` in `src/preload.js` with `ipcRenderer.invoke` or `ipcRenderer.send`.
3. Call it from `src/renderer/renderer.js`.

Keep the page free of Node access: it runs with `contextIsolation: true` and `nodeIntegration: false`. See [Security notes](../explanation/security-notes.md).
