# Review the files a session changed

Use the Changes panel to see what Claude edited in the current session, as diffs.

## Open the panel

With a session selected, click **Changes** in the header or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> (<kbd>⌘</kbd><kbd>⇧</kbd><kbd>G</kbd> on macOS). The same shortcut closes it. The app remembers whether the panel was open.

The number on the **Changes** button is the number of changed files.

## Read the list

Each row shows:

| Part | Meaning |
|---|---|
| **A** | Added: the file did not exist before the session first touched it. |
| **M** | Modified. |
| **D** | Deleted: the file existed when the session first touched it and is gone now. |
| File name and folder | Relative to the session's working directory. Files outside it show their full path. |
| `+N −M` | Lines added and removed. |

## Step through the diffs

- Click a file to show its diff.
- Press <kbd>F8</kbd> for the next file and <kbd>Shift</kbd>+<kbd>F8</kbd> for the previous one, or use the arrows above the diff. <kbd>F8</kbd> only works while the panel is open.
- Click **Open** to open the selected file in your system's default app for that file type.

## Keep the list current

The list refreshes by itself each time Claude finishes an edit in the session you are looking at. If you changed files yourself, click the refresh icon in the panel header.

## What the diff compares

Each diff compares the file now with how it looked **just before this session first edited it**. Later edits by the same session build on that one starting point, so you always see the session's total effect on the file.

Because the comparison is against the file on disk now, your own edits, or another session's edits, to the same file also show up in the diff.

## What is not shown

- **Files changed by shell commands.** Only Claude's Edit, MultiEdit, Write and NotebookEdit tools are tracked. A file changed by `sed`, a formatter or a build step run through Bash is not listed.
- **Files that are back to their starting content.** If you denied the edit, or the change was reverted, the file drops out of the list.
- **Contents of large or binary files.** Files over 1 MB show *File too large to diff*, and files containing NUL bytes show *Binary file*. They are still listed.
- **A fork's inherited changes.** A fork starts with an empty list, even though it carries its parent's conversation. Check the parent for edits made before the fork.

[How change tracking works](../explanation/change-tracking.md) explains these limits.
