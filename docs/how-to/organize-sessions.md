# Organize sessions into groups

Groups are the sections in the sidebar. A group exists as long as at least one session belongs to it; there is no separate "create group" step.

## Start a session in a new group

1. Click **+** at the top of the sidebar, or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> (<kbd>⌘</kbd><kbd>T</kbd> on macOS).
2. In **Group**, type a name that does not exist yet.
3. Fill in **Title** and **Working directory**, then click **Save**.

If you leave **Group** empty, the session goes into **Scratch**.

## Start a session in an existing group

Hover the group's header in the sidebar and click its **+**. The form opens with that group filled in, and with the working directory of the group's most recently added session, so you usually only need a title.

## Rename a session or move it to another group

1. Hover the session in the sidebar and click the pencil icon, or select it and click **Edit** in the header.
2. Change **Title** or **Group**. The group field suggests existing group names as you type.
3. Click **Save**.

The working directory cannot be changed after a session is created. To work in another folder, start a new session.

Moving a fork to another group is allowed. In the new group it is shown at the top level, because its parent is not there. Move it back and it nests under its parent again.

## Rename a group

There is no rename command for groups. Move each session in the group to the new name with **Edit**. When the last session leaves, the old group disappears.

## Collapse a group

Click the group header to collapse or expand it.

## Remove a session from the sidebar

1. Open **Edit** for the session.
2. Click **Remove from desk**.

What happens:

- If the session is running, its Claude process is stopped and its tab closed.
- Its forks are not removed. They move up one level, under the removed session's parent (or to the top level).
- Its record in the Changes panel is deleted.
- **The conversation itself is not deleted.** It stays in `~/.claude/projects` and shows up again under **Claude CLI sessions**, where you can import it back.

There is no confirmation dialog, but because the conversation is kept, removing is easy to undo.
