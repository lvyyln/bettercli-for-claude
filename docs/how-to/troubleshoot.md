# Troubleshoot common problems

When something goes wrong, check the log file first. It is `logs/main.log` inside the [app data folder](../reference/files-and-folders.md#the-app-data-folder).

## "Claude Code was not found"

The tab shows this in red, followed by the list of folders the app searched.

1. Open a normal terminal and run `claude --version`. If that fails, [install Claude Code](https://docs.claude.com/en/docs/claude-code/setup) first.
2. Find where it is installed:
   - Windows: `where claude`
   - macOS / Linux: `which claude`
3. Make sure that folder is on your PATH:
   - **Windows**: add it to the *Path* user environment variable, then quit and restart BetterCLI. Apps only see PATH changes made before they started.
   - **macOS / Linux**: the app reads PATH from your login shell (`$SHELL -ilc`), so add the folder in the file your login shell reads, such as `~/.zprofile`, `~/.zshrc` or `~/.bash_profile`. Restart the app.

The app also looks in these folders even when they are not on PATH: `~/.local/bin`, `~/.claude/local`, `/opt/homebrew/bin`, `/usr/local/bin` and, on Windows, `%APPDATA%\npm`.

## "Could not start … in …"

The `claude` executable was found but could not start in the session's working directory. The most common cause is that the folder was moved or deleted. Remove the session from the sidebar (**Edit** → **Remove from desk**) and start a new one in the right folder. The old conversation is still listed under **Claude CLI sessions**.

## The status dot never changes

Status comes from Claude Code hooks that call `curl`.

1. Check that `curl` works in a terminal: `curl --version`. On Windows the app calls `curl.exe`.
2. Check that nothing blocks connections to `127.0.0.1` on a local port, such as a strict firewall or security tool.
3. Check that only one copy of the app is running. The app prevents a second copy from starting, but a copy run from source (`npm start`) and an installed copy use separate data folders and can run together without interfering.

## No desktop notifications

- Notifications appear only when the session that changed is **not** the one you are looking at, or the window is not focused.
- They appear only when a session **needs input** or **finishes** after working. See [Session statuses](../reference/session-statuses.md#notifications).
- Check that notifications for **BetterCLI for Claude** are allowed in your system settings (Windows: *Settings → System → Notifications*; macOS: *System Settings → Notifications*).

## Windows says "Windows protected your PC"

The builds are not code-signed yet. Click **More info**, then **Run anyway**.

## macOS says the app is damaged or from an unidentified developer

The builds are not code-signed yet. Run this once, then open the app:

```
xattr -cr "/Applications/BetterCLI for Claude.app"
```

## Opening the app shows the existing window instead of a new one

This is by design. Only one copy runs at a time, because a second copy would cut every running session off from status updates. See [Status via hooks](../explanation/status-via-hooks.md#why-only-one-copy-can-run).

## A keyboard shortcut goes to Claude instead of the app

On Windows and Linux, tab actions use <kbd>Ctrl</kbd>+<kbd>Shift</kbd>, so that plain <kbd>Ctrl</kbd> keys such as <kbd>Ctrl</kbd>+<kbd>T</kbd> and <kbd>Ctrl</kbd>+<kbd>W</kbd> still reach Claude. Check the [shortcut table](../reference/keyboard-shortcuts.md).

<kbd>Ctrl</kbd>+<kbd>C</kbd> copies only when text is selected in the terminal. Otherwise it goes to Claude as usual (interrupt).

## The app crashed

1. Restart it. Your sessions and groups are saved after every change, and conversations are kept by Claude Code.
2. Look at the end of `logs/main.log` for lines tagged `[error]`.
3. Native crashes also leave a crash dump in the app's crash dump folder. Nothing is uploaded anywhere.

When reporting a bug, attach the relevant part of `main.log` and say which OS and app version you use. The version is on the first line of each run, after `started`.
