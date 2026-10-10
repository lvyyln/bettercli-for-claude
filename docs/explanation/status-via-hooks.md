# How status works: hooks and a local server

Each session shows whether Claude is working, waiting for you, or idle. This page explains where that information comes from and why it is done this way.

## The problem

The app sees each session only as a stream of terminal output. It could try to guess Claude's state from that output, for example by spotting a spinner or a permission dialog, but that breaks whenever Claude Code changes how its screen looks.

Claude Code already has a stable way to tell outside programs what it is doing: **hooks**. A hook is a command Claude Code runs at certain moments, such as before a tool runs or when it stops, and it passes a JSON description of the event on the command's standard input.

## The approach

1. When the app starts, it opens a small HTTP server on `127.0.0.1`, on a random free port.
2. It writes `hooks.json`, a Claude Code settings file whose hooks all run the same command: `curl` posting standard input to that server.
3. Every session it starts gets `--settings <path to hooks.json>`.
4. When something happens in a session, Claude Code runs the hook. `curl` posts the event to the app. The event's `session_id` says which session it was, and `hook_event_name` says what happened.
5. The app turns the event into a status and updates the sidebar.

The event-to-status table is in the [Session statuses reference](../reference/session-statuses.md#what-sets-each-status).

## Why these choices

**Why `--settings` instead of editing your settings?** Claude Code merges settings passed with `--settings` with your own user and project settings. So the app's hooks run alongside yours, only for sessions the app starts, and nothing needs to be cleaned up if you uninstall it. Sessions you run in a terminal are never affected.

**Why `curl`?** A hook is a shell command, so it needs a program that can send a request. `curl` ships with Windows 10 and later, macOS and most Linux distributions, so nothing extra has to be installed or bundled. It runs with `-s -m 2`: silent, and giving up after 2 seconds, so a missing app never holds Claude up for long. Claude Code also gives the hook a 5-second timeout.

**Why HTTP on localhost?** It is the simplest channel `curl` can reach on every OS. The server listens on `127.0.0.1` only, so it cannot be reached from the network. It answers every request with `ok` and ignores events for sessions that are not running in the app.

**Why a random port?** A fixed port could clash with another program. The cost is that `hooks.json` must be rewritten on every start, which is cheap.

## Why only one copy can run

`hooks.json` lives in the app data folder and contains the server's port. If a second copy of the app started, it would open its own server on a different port and rewrite `hooks.json`. Sessions started after that would report to the new copy, and the first copy would stop hearing from them.

So the app takes Electron's single-instance lock. Starting it again just brings the existing window to the front.

A copy run from source uses a different data folder (**BetterCLI for Claude (dev)**), with its own `hooks.json`, so it can run next to an installed copy safely.

## Interpreting `Notification`

Claude Code sends a `Notification` event both when it needs permission and when it has simply been waiting for a prompt for a while. These mean different things to you: the first needs action, the second does not. The app treats a notification as **idle** when its type is `idle_prompt` or its message mentions "waiting for your input", and as **needs input** otherwise.

## Notifications for you

Status changes also drive desktop notifications, but only for two transitions that are worth interrupting you for: a session newly needing input, and a session finishing after working. Notifications are skipped for the session you are already looking at in a focused window.

## Hooks also feed change tracking

The same `PreToolUse` and `PostToolUse` events are used to track edited files. For edit tools, the server saves the file's original content *before* it answers the hook, which matters because Claude waits for the hook to finish before running the tool. See [How change tracking works](change-tracking.md).
