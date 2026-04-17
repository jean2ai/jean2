import electronUpdater from 'electron-updater';
import { BrowserWindow, dialog } from 'electron';
import electronLog from 'electron-log';

const { autoUpdater } = electronUpdater;
const log = electronLog.default || electronLog;
type UpdateInfo = import('electron-updater').UpdateInfo;

const UPDATE_CHECK_INTERVAL = 4 * 60 * 60 * 1000;

function checkForUpdates(): void {
  console.log('[Updater] Checking for updates...');
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[Updater] Error checking for updates:', err);
  });
}

export function setupUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.logger = log;
  log.transports.file.level = 'info';

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
    sendUpdaterEvent(mainWindow, 'checking');
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log('[Updater] Update available:', info.version);
    sendUpdaterEvent(mainWindow, 'available', { version: info.version });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log('[Updater] Update not available:', info.version);
    sendUpdaterEvent(mainWindow, 'not-available', { version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[Updater] Download progress: ${progress.percent.toFixed(2)}%`);
    sendUpdaterEvent(mainWindow, 'download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log('[Updater] Update downloaded:', info.version);
    sendUpdaterEvent(mainWindow, 'downloaded', { version: info.version });

    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Jean2 ${info.version} has been downloaded.`,
        detail: 'The update will be installed when you restart the application.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err);
    sendUpdaterEvent(mainWindow, 'error', { message: err.message });
  });

  setTimeout(() => {
    checkForUpdates();
  }, 3000);

  setInterval(() => {
    checkForUpdates();
  }, UPDATE_CHECK_INTERVAL);
}

export function triggerUpdateCheck(): void {
  checkForUpdates();
}

function sendUpdaterEvent(
  window: BrowserWindow,
  type: string,
  data?: Record<string, unknown>
): void {
  if (!window.isDestroyed()) {
    window.webContents.send('updater:event', { type, data });
  }
}
