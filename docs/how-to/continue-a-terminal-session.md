# Continue a session you started in a terminal

Use this when you ran `claude` in a normal terminal and want to carry on with that conversation inside BetterCLI.

## Steps

1. In the sidebar, expand **Claude CLI sessions** at the bottom. It is collapsed when the app starts.
2. Find your session. Each row shows its title, the last folder of its working directory, and how long ago it was last active (for example `api · 3h`). Hover a row to see the full path.
3. Click the row.

The session moves into a group called **Imported** and opens in a tab, running `claude --resume <id>` in the session's original working directory.

From now on it behaves like any other BetterCLI session. You can rename it or move it to another group: see [Organize sessions](organize-sessions.md).

## If your session is not listed

- **The list is out of date.** Click the refresh icon on the **Claude CLI sessions** header. The list is loaded once, when you first expand it.
- **It is older than the 40 most recent.** Only the 40 most recently modified sessions that are not already in the sidebar are listed. Older ones can still be resumed in a terminal with `claude --resume`.
- **It is already in the sidebar.** Sessions BetterCLI knows about are not listed again. Look through your groups.
- **Its transcript has no working directory.** Sessions whose transcript does not record a `cwd` are skipped.

## Notes

- If the session has no title, the first 8 characters of its ID are used as the title.
- Importing does not move or copy the transcript. It stays in `~/.claude/projects`, so you can still resume it from a terminal. Avoid running it in both places at the same time.
