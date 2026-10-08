// Renders build/icon.svg to build/icon.png (1024x1024). Run: npx electron scripts/render-icon.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'build', 'icon.svg');
const pngPath = path.join(__dirname, '..', 'build', 'icon.png');

app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1024,
    height: 1024,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true }
  });
  const svg = fs.readFileSync(svgPath, 'utf8');
  const html = `<html><body style="margin:0;background:transparent">${svg}</body></html>`;
  win.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
      fs.writeFileSync(pngPath, image.toPNG());
      console.log('wrote', pngPath, image.getSize());
      app.quit();
    }, 300);
  });
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
});
