# Build from source

Use this to run the app from a checkout, or to package your own installer.

## Prerequisites

- Git
- Node.js 22 and npm (CI builds with Node 22)
- **Linux**: a C++ toolchain and Python, so `node-pty` can compile
- **macOS packages**: a Mac. macOS installers can only be built on macOS.

## Run in development

```
npm install
npm start
```

Development runs use a separate data folder, **BetterCLI for Claude (dev)**, so they never touch the sessions or hook settings of an installed copy. Both can run at the same time.

## Package an installer

Build for the OS you are on:

```
npm run dist:win     # Windows
npm run dist:mac     # macOS
npm run dist:linux   # Linux
```

Output goes to `dist/`. File names follow `BetterCLI-<version>-<os>-<arch>.<ext>`; the Windows installer is `BetterCLI-<version>-setup-<arch>.exe`. See [Build configuration](../reference/build-configuration.md) for the full list of targets.

The local build is not code-signed, the same as the official releases.

## Check packaging without making installers

This is what CI runs on every push and pull request. It is faster, because it only lays out the unpacked app:

```
npx electron-builder --dir --publish never
```

The result is in `dist/<platform>-unpacked/` (or `dist/mac*/` on macOS).

## Change the app icon

1. Edit `build/icon.svg`.
2. Render it to `build/icon.png` (1024 × 1024):

   ```
   npm run icon
   ```

3. Commit both files. electron-builder makes the per-platform icons from the PNG.
