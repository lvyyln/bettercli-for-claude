# Paste a screenshot into a prompt

1. Copy an image to the clipboard, for example with a screenshot tool.
2. Click into the session's terminal.
3. Press <kbd>Ctrl</kbd>+<kbd>V</kbd> (<kbd>⌘</kbd><kbd>V</kbd> on macOS). <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>V</kbd> works too.

A file path such as `/tmp/bettercli-paste-1760000000000.png` is typed into the prompt. Claude Code reads the image from that path when you send the prompt. Add your question after it and press Enter.

## Notes

- The image is saved as a PNG in your system's temporary folder. The app does not delete these files; your OS's temporary-file cleanup does.
- If the clipboard holds text, the text is pasted instead.
- To attach an image file you already have on disk, paste or type its path into the prompt.
