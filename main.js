const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = !app.isPackaged;

const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json');

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return {
    geotab: { server: '', database: '', username: '', password: '' },
    payRate: 31,
    overtimeThreshold: 40,
    overtimeMultiplier: 1.5,
    taxStatus: 'single',
    deductions: [
      { name: 'Dental/Vision', type: 'flat', value: 6.35, preTax: true },
      { name: 'Medical', type: 'flat', value: 47.89, preTax: true },
      { name: 'HSA', type: 'flat', value: 100.00, preTax: true },
    ],
  };
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Hours Tracker',
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist-react', 'index.html'));
  }
}

// IPC handlers
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_event, settings) => {
  saveSettings(settings);
  return { success: true };
});

ipcMain.handle('geotab-authenticate', async (_event, { server, database, username, password }) => {
  const url = `https://${server}/apiv1`;
  const body = JSON.stringify({
    method: 'Authenticate',
    params: { userName: username, password, database },
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Authentication failed');
  return data.result;
});

ipcMain.handle('geotab-call', async (_event, { server, method, params }) => {
  const url = `https://${server}/apiv1`;
  const body = JSON.stringify({ method, params });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'API call failed');
  return data.result;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
