# Session statuses and notifications

Each session has one status. It is shown as a coloured dot in the sidebar and on the tab, and in words in the status bar.

## Statuses

| Status | Shown as | Meaning |
|---|---|---|
| `busy` | **Working** | Claude is processing a prompt or using a tool. |
| `waiting` | **Needs input** | Claude is waiting for you, usually at a permission prompt. |
| `idle` | **Idle** | The Claude process is running and ready for a prompt. |
| `stopped` | **Stopped** | No Claude process is running for this session. |

## What sets each status

| Event | New status |
|---|---|
| The session's Claude process starts | `idle` |
| Hook `UserPromptSubmit` | `busy` |
| Hook `PreToolUse` (any tool) | `busy` |
| Hook `PostToolUse` (any tool) | `busy` |
| Hook `Notification`, with `notification_type` `idle_prompt` or a message containing "waiting for your input" | `idle` |
| Hook `Notification`, any other | `waiting` |
| Hook `Stop` | `idle` |
| The Claude process exits, or its tab is closed | `stopped` |

Sessions that are not running when the app starts show `stopped`.

Hook events are ignored for sessions that are not running in this app. A session you run in a separate terminal does not change any status in BetterCLI.

[How status works](../explanation/status-via-hooks.md) explains the mechanism.

## Notifications

A desktop notification is shown when:

| Change | Notification text |
|---|---|
| A session becomes `waiting` (from any other status) | **Needs your input** |
| A session goes from `busy` to `idle` | **Finished** |

The notification title is the session's title.

No notification is shown if the BetterCLI window is focused **and** the session is the one in the active tab.

When a notification is shown while the window is not focused, the taskbar icon flashes (on Windows) until you focus the window.

Clicking a notification restores and focuses the window and switches to that session's tab.
