# Your first contribution

In this tutorial you run BetterCLI from source, change something you can see in the app, and find the log file it writes. It is a practical tour of the codebase and takes about 20 minutes.

You should be comfortable with Git, Node.js and a code editor. You do not need to know Electron yet.

## Before you start

You need:

- Git
- Node.js 22 (the version CI uses) and npm
- Claude Code installed and signed in, so the app has something to run
- On Linux only: a C++ toolchain and Python, so `node-pty` can compile

## 1. Get the code and run it

```
git clone https://github.com/lvyyln/bettercli-for-claude.git
cd bettercli-for-claude
npm install
npm start
```

The app window opens. Running from source uses its own data folder, named **BetterCLI for Claude (dev)**, so nothing you do here touches the sessions or settings of an installed copy. See [Files and folders](../reference/files-and-folders.md#the-app-data-folder) for where that folder is.

Create a session with **New session** so you have something to look at, then quit the app.

## 2. Take a quick look around

The whole app is in `src/`:

```
src/
├── main.js              Main process: window, sessions, Claude processes, hook server
├── changes.js           Change tracking for the Changes panel
├── log.js               Log file writer
├── preload.js           The bridge: exposes window.desk to the page
└── renderer/
    ├── index.html       Page layout
    ├── renderer.js      All UI behaviour
    ├── styles.css       Styles, driven by CSS variables
    └── themes.js        Colour themes
```

The page (`renderer.js`) never touches the file system or starts processes. It asks the main process to, through the functions in `window.desk`. [Architecture](../explanation/architecture.md) explains the split.

## 3. Add a theme

You will add a theme called **Forest**. Themes are a good first change because they live in one file and you see the result straight away.

1. Open `src/renderer/themes.js`. Each entry in `THEMES` has a `label`, a `ui` block (app colours) and a `term` block (terminal colours).
2. Copy the whole `midnight` entry and paste it as a new entry named `forest`.
3. Change its `label` to `'Forest'` and replace its `ui` block with this one:

   ```js
   ui: {
     bg: '#0F1A14', panel: '#13211A', term: '#0B140F', border: '#22382B', border2: '#2C4636',
     text: '#E3EFE6', muted: '#9DB3A4', faint: '#7E9586', accent: '#7FD18B', accentText: '#0F1A14',
     warn: '#E8B45A', idle: '#4A5C50', selected: '#1F3328', hover: '#182A20', danger: '#F2A3A3'
   },
   ```

4. In its `term` block, change only `background` to `'#0B140F'`. Leave the other terminal colours as they are.
5. Run `npm start` again.
6. Open the theme picker at the bottom of the sidebar. **Forest** is in the list. Pick it.

The sidebar, tabs, terminal and (on Windows and Linux) the window title bar all turn green. The app remembers your choice the next time it starts.

There is no hot reload: quit the app and run `npm start` again after each change.

## 4. Find the logs

The main process writes a log file. Open the dev data folder from step 1 and look in `logs/main.log`. The first line of each run looks like this (your version numbers will differ):

```
2026-10-10T09:12:03.512Z [info] started 0.2.4 win32 x64 electron 44.7.0
```

Errors from the page end up here too, tagged `renderer`. When something goes wrong, this file is the first place to look.

To see a log line you wrote, add one to `src/main.js`. For example, in `openPty`, after the session is found:

```js
log.info('opening session', session.title);
```

Restart, open a session, and check `main.log` again.

## 5. Undo your experiment

Unless you want to propose the Forest theme for real, put things back:

```
git checkout -- src
```

## What you have learned

You have:

- run the app from source with its own separate data folder
- seen how the code is split between the main process and the page
- changed the UI and seen the result
- found and written to the log file

## Next steps

- [Architecture](../explanation/architecture.md): how the pieces fit together
- [IPC API](../reference/ipc-api.md): every call the page can make into the main process
- [Themes reference](../reference/themes.md): what each colour token controls
- [Build from source](../how-to/build-from-source.md): make an installer
