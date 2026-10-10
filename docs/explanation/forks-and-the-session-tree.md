# Forks and the session tree

Forking is the feature the app is built around. This page explains what a fork is, how the app creates one, and how it draws the tree.

## What a fork is

A fork is a new Claude Code session that starts with a copy of another session's conversation. From then on the two are independent: what you say in one, the other never sees.

Forks are useful when you want to try a different approach without losing the current one, ask a side question without cluttering the main thread, or run two directions in parallel from the same starting point.

A fork shares the **conversation**, not the **files**. Both sessions work in the same folder, so if the fork edits a file, the parent sees the edited file on disk, even though its conversation knows nothing about the edit. If you want truly separate files, start the fork in a separate copy of the project, such as a Git worktree. The app does not do this for you.

## How the app creates one

Claude Code supports forking directly:

```
claude --resume <parent-id> --fork-session --session-id <new-id> -n <title>
```

`--resume` loads the parent's conversation, `--fork-session` makes Claude write it to a new session instead of appending to the parent, and `--session-id` makes that new session use an ID the app chose.

Choosing the ID up front matters. The app creates the sidebar entry first, with its new ID and `parentId`, and only then starts the process. Because the ID is known in advance, the app never has to work out afterwards which new transcript belongs to which tab, and hook events from the new session match its sidebar entry from the very first one.

The new entry is marked `pending: "fork"` until its process has started. After that it is an ordinary session and is reopened with plain `--resume <id>`. If the process fails to start, the mark stays, so the fork is attempted again next time.

## The tree is the app's, not Claude's

Claude Code does not record which session a fork came from in a way the app uses. The parent link (`parentId`) is stored only in `desk.json`. That has a few consequences:

- **Imported sessions have no parent.** Even if you forked a session in a terminal, it comes in at the top level.
- **The tree survives renames and group moves**, because it links IDs, not titles.
- **Removing a session keeps its forks.** They are moved up to the removed session's parent, so the tree stays connected. The forks' conversations are complete copies, so they do not depend on the parent's transcript.

## Drawing the tree

The sidebar groups sessions first, then nests forks inside each group:

1. For each group, take the sessions in that group.
2. Roots are sessions with no parent, **or whose parent is in a different group**.
3. Under each root, list its children recursively, indented 16 px per level with a branch mark.

Rule 2 is why moving a fork to another group shows it at the top level there. The `parentId` is kept, so the header still says *forked from …*, and moving it back restores the nesting.

New forks go into the parent's group, with the title *Fork of &lt;parent title&gt;*. Rename them to something that says what you are trying in that fork.

## Related

- [How the app runs `claude`](../reference/claude-invocations.md)
- [desk.json format](../reference/files-and-folders.md#deskjson)
