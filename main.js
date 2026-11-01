const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.bmp', '.svg', '.avif', '.ico', '.tif', '.tiff',
]);

// 按文件名自然排序（img2 排在 img10 前面）
function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function scanFolder(folderPath) {
  const entries = fs.readdirSync(folderPath, { withFileTypes: true });
  const images = entries
    .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => {
      const full = path.join(folderPath, e.name);
      return {
        name: e.name,
        url: pathToFileURL(full).href,
      };
    })
    .sort((a, b) => naturalCompare(a.name, b.name));
  return images;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    title: '图片预览播放器',
    backgroundColor: '#14161d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  ipcMain.handle('dialog:selectFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择图片文件夹',
      buttonLabel: '选择',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const folderPath = result.filePaths[0];
    try {
      const images = scanFolder(folderPath);
      return { folderPath, images };
    } catch (err) {
      return { folderPath, images: [], error: String((err && err.message) || err) };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
