# Themes

Themes are defined in `src/renderer/themes.js`, in the `THEMES` object.

## Built-in themes

| Key | Label | Light or dark |
|---|---|---|
| `midnight` | Midnight | Dark (default) |
| `nord` | Nord | Dark |
| `dracula` | Dracula | Dark |
| `solarized` | Solarized Dark | Dark |
| `daylight` | Daylight | Light |

The chosen theme is saved in the page's local storage under the key `theme`. An unknown key falls back to `midnight`.

## Theme structure

```js
key: {
  label: 'Shown in the picker',
  ui:   { /* app colours */ },
  term: { /* terminal colours */ }
}
```

### `ui`

Each `ui` entry becomes a CSS variable of the same name on the page (`bg` → `--bg`), used by `styles.css`.

| Token | Used for |
|---|---|
| `bg` | Page background |
| `panel` | Sidebar, bars and panel headers. Also the title bar colour on Windows and Linux, and the window's background colour. |
| `term` | Terminal area, active tab, diff background |
| `border` | Dividers between areas |
| `border2` | Borders of buttons, inputs and dialogs; scrollbar thumbs; icon-button hover |
| `text` | Main text. Also the title bar button colour on Windows and Linux. |
| `muted` | Secondary text, such as the breadcrumb and section titles |
| `faint` | Counts, diff hunk headers, scrollbar thumb on hover |
| `accent` | Primary buttons, focus outline, active-tab marker, **Working** dot, **A** (added) |
| `accentText` | Text on `accent` backgrounds |
| `warn` | **Needs input** dot, **M** (modified) |
| `idle` | **Idle** dot (filled) and **Stopped** dot (outline) |
| `selected` | Selected rows, the **Changes** button while the panel is open |
| `hover` | Hovered rows and buttons, diff hunk header background |
| `danger` | **Remove from desk**, **D** (deleted) |

### `term`

Passed as-is to xterm.js as its [theme](https://xtermjs.org/docs/api/terminal/interfaces/itheme/):

`background`, `foreground`, `cursor`, `selectionBackground`, `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, `brightBlack`, `brightRed`, `brightGreen`, `brightYellow`, `brightBlue`, `brightMagenta`, `brightCyan`, `brightWhite`.

## Adding a theme

Add an entry to `THEMES` with every `ui` token and every `term` colour listed above. The picker lists themes in the order they appear in the object. No other file needs to change. [Your first contribution](../tutorials/first-contribution.md#3-add-a-theme) walks through it.
