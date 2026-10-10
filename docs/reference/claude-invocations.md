# How the app runs `claude`

Every tab is a real `claude` process started in a pseudo-terminal. This page lists exactly how it is started.

## Command lines

Every invocation starts with `--settings <app data>/hooks.json`. See [Files and folders](files-and-folders.md#hooksjson).

| Situation | Arguments after `--settings` |
|---|---|
| New session | `--session-id <id> -n <title>` |
| Fork | `--resume <parentId> --fork-session --session-id <id> -n <title>` |
| Reopen a session | `--resume <id>` |
| Reopen a session whose transcript is missing | `--session-id <id> -n <title>` (starts a new, empty conversation with the same ID) |

- `<id>` is a random UUID made by the app when the session is created. For imported sessions it is the existing Claude session ID.
- `<title>` is the title shown in the sidebar, as it was when the session was first started. Renaming a session later changes only the sidebar.
- A session counts as *new* or *fork* until its process has started once. After that it is always reopened with `--resume`.
- "Transcript missing" means no file named `<id>.jsonl` exists in any folder under `~/.claude/projects`.

## Process settings

| Setting | Value |
|---|---|
| Working directory | The session's working directory |
| Terminal type (`name`) | `xterm-256color` |
| Initial size | The tab's size, or 120 × 30 if unknown. Resized whenever the tab resizes. |
| Environment | The app's environment, plus `FORCE_COLOR=1`, minus the variables below |

### Removed environment variables

If you start BetterCLI from inside a Claude Code session, it inherits variables that mark it as a child of that session. Claude Code does not save transcripts for child sessions, so the app removes them:

```
CLAUDECODE
CLAUDE_CODE_CHILD_SESSION
CLAUDE_CODE_SESSION_ID
CLAUDE_CODE_SESSION_ATTENDED
CLAUDE_CODE_ENTRYPOINT
CLAUDE_CODE_EXECPATH
CLAUDE_CODE_MESSAGING_SOCKET
CLAUDE_CODE_MESSAGING_TOKEN
CLAUDE_PID
CLAUDE_EFFORT
```

## Finding the `claude` executable

On macOS and Linux, the app first replaces its `PATH` with the one from your login shell, by running `$SHELL -ilc 'printf %s "$PATH"'` (with `/bin/zsh` on macOS or `/bin/bash` on Linux if `SHELL` is not set). This gives apps started from Finder or a desktop launcher the same `PATH` as your terminal. It times out after 5 seconds.

It then looks for the executable in each `PATH` folder, followed by these fallbacks:

1. `~/.local/bin`
2. `~/.claude/local`
3. `/opt/homebrew/bin`
4. `/usr/local/bin`
5. `%APPDATA%\npm` (Windows)

| OS | File names tried, in order |
|---|---|
| Windows | `claude.exe`, `claude.cmd` |
| macOS, Linux | `claude` |

The first match wins. If nothing matches, the app tries to run plain `claude`. If starting it throws an error, the tab shows *Claude Code was not found* with the list of folders it searched. If the process starts but exits straight away, the tab shows *session ended with exit code N* instead.

## Stopping

Closing a tab, removing a session, or closing the app window kills the session's process. Closing the window stops every session and quits the app, on macOS as well.
