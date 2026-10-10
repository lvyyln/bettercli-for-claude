# Files and folders

BetterCLI keeps its own data in one folder, and never changes Claude Code's files or your Claude settings.

## The app data folder

| OS | Installed app | Run from source (`npm start`) |
|---|---|---|
| Windows | `%APPDATA%\BetterCLI for Claude` | `%APPDATA%\BetterCLI for Claude (dev)` |
| macOS | `~/Library/Application Support/BetterCLI for Claude` | `~/Library/Application Support/BetterCLI for Claude (dev)` |
| Linux | `~/.config/BetterCLI for Claude` | `~/.config/BetterCLI for Claude (dev)` |

Contents:

| Path | What it is |
|---|---|
| `desk.json` | Sidebar data: sessions, titles, groups, parents. |
| `hooks.json` | Claude Code settings passed to each session with `--settings`. Rewritten on every start. |
| `changes/<session-id>.json` | Baselines for the Changes panel, one file per session. |
| `logs/main.log` | Log file. |
| `logs/main.old.log` | Previous log. `main.log` is renamed to this at startup when it is over 5 MB. |
| Electron's own folders | Browser storage (theme, font size, panel state), cache, crash dumps. |

## Outside the app data folder

| Path | What it is |
|---|---|
| `~/.claude/projects/<project>/<session-id>.jsonl` | Conversation transcripts. Written by Claude Code, read by the app to find resumable sessions and to list **Claude CLI sessions**. Never modified or deleted by the app. |
| `<system temp>/bettercli-paste-<timestamp>.png` | Pasted images. Not deleted by the app. |

## desk.json

Written after every change to the sidebar, as indented JSON.

```json
{
  "sessions": [
    {
      "id": "5f0c3a52-8a8e-4c2f-9a57-0d7e1f3b6c21",
      "createdAt": "2026-10-10T09:15:42.118Z",
      "title": "Hello",
      "group": "Tutorial",
      "cwd": "C:\\Users\\me\\bettercli-tutorial",
      "parentId": null
    },
    {
      "id": "b7d9e0f4-2c61-4b8a-8f3e-6a1d2c9e7b55",
      "createdAt": "2026-10-10T09:21:07.903Z",
      "title": "Fork of Hello",
      "group": "Tutorial",
      "cwd": "C:\\Users\\me\\bettercli-tutorial",
      "parentId": "5f0c3a52-8a8e-4c2f-9a57-0d7e1f3b6c21"
    }
  ]
}
```

| Field | Type | Meaning |
|---|---|---|
| `id` | string | Claude Code session ID (a UUID). Also the transcript file name. |
| `createdAt` | string | ISO 8601 time the session was added to the sidebar. |
| `title` | string | Title shown in the sidebar and on the tab. |
| `group` | string | Group name. `Imported` for sessions brought in from **Claude CLI sessions**. |
| `cwd` | string | Working directory. Cannot be changed in the app. |
| `parentId` | string or `null` | ID of the session this one was forked from. |
| `pending` | `"new"` or `"fork"` | Present only until the session's process has started once. Decides how it is first started; see [How the app runs `claude`](claude-invocations.md). |

Sessions are listed in the order they were added. The sidebar shows groups in the order their first session appears.

### Moving from "Claude Desk"

Early builds were called *Claude Desk* and stored their data in `<appData>/claudedesk/desk.json`. When an installed copy of BetterCLI starts and has no `desk.json` of its own, it copies that file over. The old file is left in place.

## hooks.json

Written at every start, because it contains the port of the app's local status server, which changes each run:

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "curl -s -m 2 -X POST --data-binary \"@-\" http://127.0.0.1:52344/hook", "timeout": 5 }] }],
    "PreToolUse":       [{ "matcher": "*", "hooks": [ /* same hook */ ] }],
    "PostToolUse":      [{ "matcher": "*", "hooks": [ /* same hook */ ] }],
    "Notification":     [{ "hooks": [ /* same hook */ ] }],
    "Stop":             [{ "hooks": [ /* same hook */ ] }]
  }
}
```

On Windows the command uses `curl.exe`. Claude Code pipes each hook's JSON payload to the command's standard input, and `--data-binary "@-"` sends it on.

This file is only used by sessions the app starts. Your own `~/.claude/settings.json` and project settings are not touched, and their hooks keep working alongside these.

## changes/&lt;session-id&gt;.json

One file per session that has edited at least one file.

```json
{
  "files": {
    "C:\\Users\\me\\bettercli-tutorial\\notes.md": { "content": "- apple\n- pear\n- plum\n" },
    "C:\\Users\\me\\bettercli-tutorial\\todo.md": { "content": null },
    "C:\\Users\\me\\bettercli-tutorial\\big.log": { "tooLarge": true }
  }
}
```

Each key is an absolute file path. The value is the file as it was just before the session first edited it:

| Value | Meaning |
|---|---|
| `{ "content": "…" }` | The file's text. |
| `{ "content": null }` | The file did not exist. |
| `{ "tooLarge": true }` | The file was over 1 MB (1,048,576 bytes). |
| `{ "binary": true }` | The file contained a NUL byte. |

The file is deleted when the session is removed from the sidebar.

## Log format

```
<ISO time> [info|warn|error] <message>
```

Each run starts with a line like `[info] started 0.2.4 win32 x64 electron 44.7.0`. Errors from the page are logged with the prefix `renderer`. Error lines are also written to standard error.
