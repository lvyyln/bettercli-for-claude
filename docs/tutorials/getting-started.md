# Getting started

In this tutorial you install BetterCLI, start a Claude Code session in it, fork that session, and look at the files the fork changed. It takes about 15 minutes.

By the end you will have two sessions in the sidebar, one nested under the other, and you will know how to move between them.

## Before you start

You need:

- Claude Code installed and signed in. Open a normal terminal and run `claude`. If it starts, you are ready. Quit it again with `/exit`.
- `curl` on your PATH. It ships with Windows 10 and later, macOS, and most Linux distributions.
- An empty practice folder. This tutorial asks Claude to create files, so make a new folder such as `~/bettercli-tutorial`.

## 1. Install the app

1. Open the [latest release](https://github.com/lvyyln/bettercli-for-claude/releases/latest).
2. Download the file for your system:
   - Windows: `BetterCLI-x.y.z-setup.exe`
   - macOS: `BetterCLI-x.y.z-mac-arm64.dmg` on Apple Silicon, `-mac-x64.dmg` on Intel
   - Linux: the `.AppImage`
3. Install and start it.

The builds are not code-signed yet, so your system may warn you:

- **Windows**: SmartScreen shows "Windows protected your PC". Click **More info**, then **Run anyway**.
- **macOS**: if the app is reported as damaged, run this once in Terminal, then open the app again:

  ```
  xattr -cr "/Applications/BetterCLI for Claude.app"
  ```

The window opens with an empty sidebar on the left and the message **No session open**.

## 2. Start your first session

1. Click **New session**.
2. Fill in the form:
   - **Title**: `Hello`
   - **Group**: `Tutorial`
   - **Working directory**: click **Browse** and pick your practice folder.
3. Click **Save**.

A tab called **Hello** opens and Claude Code starts inside it. This is the same `claude` you ran in your terminal, so everything you know from there works here.

In the sidebar, the session appears under a **Tutorial** group. The dot next to its name is grey: the session is **Idle**.

## 3. Watch the status change

Type this prompt and press Enter:

```
Create a file called notes.md with a short list of three fruits.
```

Watch the dot next to **Hello**:

- It turns to **Working** while Claude thinks and uses tools.
- If Claude asks permission to write the file, it changes to **Needs input**. Approve the request in the terminal.
- When Claude finishes its reply, it goes back to **Idle**.

The status bar at the bottom of the window shows the same status in words, together with the working directory and the session ID.

## 4. Fork the session

A fork is a new session that starts with the whole conversation so far. The original session is left as it was.

1. Click **Fork** in the header above the terminal. You can also press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> (<kbd>⌘</kbd><kbd>D</kbd> on macOS).
2. A new tab opens, called **Fork of Hello**.

In the sidebar, the fork sits under **Hello**, indented, with a branch line. The header reads **Tutorial › forked from Hello**.

Ask the fork to do something different:

```
Add three vegetables to notes.md, and create a second file called todo.md with one task.
```

Approve the edits if Claude asks.

## 5. Review what the fork changed

1. Click **Changes** in the header, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> (<kbd>⌘</kbd><kbd>⇧</kbd><kbd>G</kbd> on macOS).
2. The **Changed files** panel opens on the right. It lists:
   - `notes.md` marked **M** (modified), with a count of added and removed lines
   - `todo.md` marked **A** (added)
3. Click a file to see its diff below the list. Green lines were added, red lines were removed.
4. Press <kbd>F8</kbd> to step to the next file and <kbd>Shift</kbd>+<kbd>F8</kbd> to step back.

The diff compares each file with how it looked *before this session first edited it*. So `notes.md` shows only the vegetables, not the fruits: the fruits were already there when the fork started.

## 6. Switch between sessions

Click **Hello** in the sidebar, or press <kbd>Ctrl</kbd>+<kbd>Tab</kbd>. The original session is unchanged: it has no idea the fork added vegetables. Its own Changes panel shows only `notes.md` as added, from step 3.

## 7. Close and resume

1. Hover the **Hello** tab and click its **×**. The tab closes and that Claude process stops. The dot turns to **Stopped**.
2. Click **Hello** in the sidebar again. The session resumes with its full conversation.

Closing a tab never deletes anything. The conversation stays where Claude Code keeps it, in `~/.claude/projects`.

## What you have learned

You have:

- started a session in a chosen folder and group
- read its live status
- forked it, so you can try a different direction without losing the original
- reviewed the files a session changed
- closed and resumed a session

## Next steps

- [Continue a session you started in a terminal](../how-to/continue-a-terminal-session.md)
- [Organize sessions into groups](../how-to/organize-sessions.md)
- [Keyboard shortcuts](../reference/keyboard-shortcuts.md)
- [Forks and the session tree](../explanation/forks-and-the-session-tree.md), to see how forking works underneath
