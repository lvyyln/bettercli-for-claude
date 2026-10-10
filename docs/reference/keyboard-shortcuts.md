# Keyboard shortcuts

On Windows and Linux, tab actions use <kbd>Ctrl</kbd>+<kbd>Shift</kbd>, as Windows Terminal does, so plain <kbd>Ctrl</kbd> keys such as <kbd>Ctrl</kbd>+<kbd>T</kbd> and <kbd>Ctrl</kbd>+<kbd>W</kbd> still reach Claude. On macOS, they use <kbd>⌘</kbd>.

| Action | Windows / Linux | macOS | Notes |
|---|---|---|---|
| New session | Ctrl+Shift+T | ⌘T | Opens the *New session* form. |
| Close tab | Ctrl+Shift+W | ⌘W | Also stops that session's Claude process. |
| Fork current session | Ctrl+Shift+D | ⌘D | |
| Show / hide changed files | Ctrl+Shift+G | ⌘⇧G | |
| Next / previous changed file | F8 / Shift+F8 | F8 / Shift+F8 | Only while the Changes panel is open. Wraps around. |
| Next / previous tab | Ctrl+Tab / Ctrl+Shift+Tab | Ctrl+Tab / Ctrl+Shift+Tab | Uses Ctrl on macOS too. Wraps around. |
| Go to tab 1–8 | Ctrl+1 … Ctrl+8 | ⌘1 … ⌘8 | If there is no tab with that number, the current tab stays. |
| Go to last tab | Ctrl+9 | ⌘9 | |
| Bigger font | Ctrl+= or Ctrl++ | ⌘= | Number pad <kbd>+</kbd> works too. Maximum 24. |
| Smaller font | Ctrl+- | ⌘- | Number pad <kbd>−</kbd> works too. Minimum 9. |
| Reset font size | Ctrl+0 | ⌘0 | Back to 13. |
| Paste text or image | Ctrl+V or Ctrl+Shift+V | ⌘V | An image is pasted as a file path. See [Paste a screenshot](../how-to/paste-images.md). |
| Copy selection | Ctrl+C | ⌘C | Only when text is selected. Otherwise <kbd>Ctrl</kbd>+<kbd>C</kbd> goes to Claude. The selection is cleared after copying. |
| Open a link | Ctrl+click | ⌘+click | A plain click selects text instead. Only `http`, `https` and `mailto` links open. |
| New line in the prompt | Shift+Enter | Shift+Enter | |

## Behaviour details

- **Keyboard layout.** Letter and number shortcuts use the physical key position, so they work with any layout. For example, with a Cyrillic layout, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd> still opens a new session.
- **Alt.** Shortcuts do not fire when <kbd>Alt</kbd> (<kbd>⌥</kbd>) is held, so those combinations go to Claude.
- **Dialogs.** While the *New session* or *Edit session* form is open, app shortcuts are switched off.
- **Priority.** App shortcuts are handled before the terminal sees the key. Any key combination not in the table above goes to Claude.
- **Saved settings.** The font size is remembered between runs.
