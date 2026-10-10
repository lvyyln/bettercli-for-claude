# How change tracking works

The Changes panel shows what a session did to your files. This page explains how the app knows that, and why it has the limits it has.

## What "changed" means here

The panel answers one question: *how is this file different now from just before this session first touched it?*

That is different from `git diff`, which compares with the last commit. If you had uncommitted work in a file before the session started, `git diff` mixes it in; the Changes panel does not. It is also different from showing each edit separately: if Claude edits a file five times, you see one combined diff.

## Baselines

The key is capturing each file's content **before** the first edit. The app does this with the `PreToolUse` hook:

1. Claude decides to use Edit, MultiEdit, Write or NotebookEdit on a file.
2. Before the tool runs, Claude Code fires `PreToolUse` and **waits for the hook to finish**.
3. The app's hook server gets the event. If this session has not touched this file before, it reads the file and saves it as the baseline in `changes/<session-id>.json`.
4. Only then does the server reply, the hook finishes, and the tool runs.

Because Claude waits for step 4, the baseline is always the file as it was before the edit. Later edits to the same file are ignored at this stage: the first baseline stays.

When `PostToolUse` arrives for an edit tool, the app tells the page to refresh the list, if that session is on screen.

## Computing the diff

Diffs are computed when you look, not when the edit happens. For each file with a baseline, the app reads the file from disk now and compares it with the baseline, using the `diff` package with 3 lines of context.

This has two effects:

- **The diff is always current.** If you, a formatter, or another session change the file afterwards, the diff includes that. It describes the file, not only Claude's keystrokes.
- **Files that end up unchanged disappear.** If an edit was denied at the permission prompt, the baseline was still saved (step 3 happens before you answer), but the file never changed, so it has no diff and is not listed. The same goes for changes that were later undone.

## Limits, and why

**Shell commands are not tracked.** The app only knows a file is about to change because an edit tool names it. A Bash command like `sed -i …` or `npm run format` could change any file, and its `PreToolUse` event says nothing reliable about which. Tracking those would need snapshots of the whole folder, which is slow and heavy for large projects.

**Files over 1 MB are not diffed.** Their baseline is not stored, to keep the record files small and diffs fast. They are still listed, with a note.

**Binary files are not diffed.** A file containing a NUL byte is treated as binary. It is listed with a note.

**Forks start empty.** A fork has a new session ID and therefore its own, empty record. Its baselines are taken the first time *it* edits each file, so its diffs show only what the fork did.

**Records live as long as the session's sidebar entry.** They survive restarts. Removing the session from the sidebar deletes its record.

## Related

- [Review the files a session changed](../how-to/review-changes.md)
- [changes/&lt;session-id&gt;.json format](../reference/files-and-folders.md#changessession-idjson)
- [How status works](status-via-hooks.md)
