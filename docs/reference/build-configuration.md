# Build configuration

Packaging is done by [electron-builder](https://www.electron.build/), configured in the `build` section of `package.json`.

## npm scripts

| Script | Command | What it does |
|---|---|---|
| `start` | `electron .` | Runs the app from source, using the **(dev)** data folder. |
| `icon` | `electron scripts/render-icon.js` | Renders `build/icon.svg` to `build/icon.png` at 1024 × 1024. |
| `dist` | `electron-builder` | Packages for the current OS with its default targets below. |
| `dist:win` | `electron-builder --win` | Windows targets. |
| `dist:mac` | `electron-builder --mac` | macOS targets. Must run on macOS. |
| `dist:linux` | `electron-builder --linux` | Linux targets. |

## Dependencies

| Package | Role |
|---|---|
| `electron` (dev) | App runtime |
| `electron-builder` (dev) | Packaging |
| `node-pty` | Pseudo-terminals for the `claude` processes. Native module. |
| `@xterm/xterm` | Terminal rendering |
| `@xterm/addon-fit` | Fits the terminal to its container |
| `@xterm/addon-web-links` | Clickable links in terminal output |
| `diff` | Diffs for the Changes panel |

## electron-builder settings

| Setting | Value | Notes |
|---|---|---|
| `appId` | `io.github.lvyyln.bettercli` | Must match the ID `src/main.js` passes to `app.setAppUserModelId`, or Windows notifications show the wrong source. |
| `productName` | `BetterCLI for Claude` | Also names the app data folder. |
| `files` | `src/**/*`, `package.json` | Plus production `node_modules`. |
| `asarUnpack` | `node_modules/node-pty/**` | node-pty's native binaries cannot load from inside the asar archive. |
| `npmRebuild` | `false` | Native modules are not rebuilt during packaging. |
| `directories.output` | `dist` | |
| `directories.buildResources` | `build` | Icon source. |
| `publish` | GitHub, `lvyyln/bettercli-for-claude`, `releaseType: draft` | Used only when publishing (the Release workflow). |

## Release files

`artifactName` is `BetterCLI-${version}-${os}-${arch}.${ext}`, except the NSIS installer.

| OS | Target | Architectures | File |
|---|---|---|---|
| Windows | NSIS installer | x64, arm64 | `BetterCLI-<v>-setup.exe` (both architectures), plus `-setup-x64.exe` and `-setup-arm64.exe` |
| Windows | zip | x64, arm64 | `BetterCLI-<v>-win-x64.zip`, `-win-arm64.zip` |
| macOS | dmg | x64, arm64 | `BetterCLI-<v>-mac-x64.dmg`, `-mac-arm64.dmg` |
| macOS | zip | x64, arm64 | `BetterCLI-<v>-mac-x64.zip`, `-mac-arm64.zip` |
| Linux | AppImage, deb, tar.gz | x64 | `BetterCLI-<v>-linux-<arch>.AppImage` and so on. Exact `<arch>` spelling follows electron-builder per format. |

The NSIS installer is per-user (`perMachine: false`), not one-click, and lets the user choose the install folder.

macOS builds use the `public.app-category.developer-tools` category; Linux builds use `Development`.

None of the builds are code-signed: both workflows set `CSC_IDENTITY_AUTO_DISCOVERY=false`.

## CI workflows

Both run on `windows-latest`, `macos-latest` and `ubuntu-latest` with Node 22 and `npm ci`, with `fail-fast: false` so one failing platform does not cancel the others.

| Workflow | File | Triggers | Runs | Publishes |
|---|---|---|---|---|
| Build | `.github/workflows/build.yml` | Push to `main`, any pull request | `electron-builder --dir --publish never` | Nothing. Checks that every platform still packages. |
| Release | `.github/workflows/release.yml` | Push of a tag matching `v*`; manual run | `electron-builder --publish always` | Uploads every file to a draft GitHub Release, using the built-in `GITHUB_TOKEN`. |

See [Release a new version](../how-to/release-a-version.md).
