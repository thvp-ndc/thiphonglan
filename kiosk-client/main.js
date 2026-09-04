const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');
const path = require('node:path');
const dgram = require('node:dgram');

const UDP_PORT = 41234;
let mainWindow = null;
let udpSocket = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    kiosk: true, // Native lockdown mode
    alwaysOnTop: true,
    frame: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
    backgroundColor: '#090d16',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false // Disable developer tools for students
    }
  });

  // Make sure it stays on top on Windows
  mainWindow.setAlwaysOnTop(true, 'screen-saver');

  // Load the initial UDP radar discovery screen
  mainWindow.loadFile(path.join(__dirname, 'connection.html'));

  // Window Focus Guard: If focus is lost, re-focus and send violation alert
  mainWindow.on('blur', () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.focus();
        mainWindow.webContents.send('kiosk-violation', {
          type: 'focus_loss',
          message: 'Cảnh báo: Ứng dụng thi bị mất tiêu điểm!'
        });
      }
    }, 100);
  });

  // Intercept all keyboard events at webContents level
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // Block Alt+Tab, Alt+F4, Windows Key, F11, F12, Ctrl+Shift+I, Ctrl+R, Ctrl+W
    const isF12 = input.key === 'F12';
    const isF11 = input.key === 'F11';
    const isReload = (input.control || input.meta) && (input.key.toLowerCase() === 'r');
    const isDevTools = (input.control || input.meta) && input.shift && (input.key.toLowerCase() === 'i' || input.key.toLowerCase() === 'j');
    const isClose = input.alt && input.key === 'F4';
    const isEscapeTask = (input.control || input.meta) && input.key === 'Escape';
    const isTabSwitch = input.alt && input.key === 'Tab';

    if (isF12 || isF11 || isReload || isDevTools || isClose || isEscapeTask || isTabSwitch) {
      event.preventDefault();
      mainWindow.webContents.send('kiosk-violation', {
        type: 'blocked_key',
        message: `Phát hiện phím tắt bị cấm: ${input.key}`
      });
    }

    // Teacher Emergency Exit Combo: Ctrl + Alt + Shift + Q
    if (input.control && input.alt && input.shift && input.key.toLowerCase() === 'q') {
      const promptPassword = true;
      if (promptPassword) {
        console.log('[KIOSK] Emergency exit combo triggered.');
        app.quit();
      }
    }
  });

  // Start listening for UDP Broadcast beacons from Teacher Server
  startUdpDiscovery();
}

function startUdpDiscovery() {
  try {
    udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    udpSocket.on('error', (err) => {
      console.error('[UDP Client] Socket error:', err.message);
    });

    udpSocket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.service === 'LAN_EXAM_SERVER') {
          console.log(`[UDP Client] Discovered exam server at ${data.ip}:${data.port}`);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('server-found', data);
          }
        }
      } catch (e) {
        // Ignore unparseable broadcast messages from other devices
      }
    });

    udpSocket.bind(UDP_PORT, () => {
      console.log(`[UDP Client] Listening for LAN exam servers on UDP port ${UDP_PORT}...`);
      
      // Proactively send a probe to 255.255.255.255
      try {
        udpSocket.setBroadcast(true);
        const probeMsg = Buffer.from('DISCOVER_LAN_EXAM_SERVER');
        udpSocket.send(probeMsg, 0, probeMsg.length, UDP_PORT, '255.255.255.255');
      } catch (err) {}
    });
  } catch (err) {
    console.error('[UDP Client] Failed to bind UDP socket:', err.message);
  }
}

// IPC Commands
ipcMain.on('connect-to-server', (_, url) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('[KIOSK] Navigating to server URL:', url);
    mainWindow.loadURL(url);
  }
});

ipcMain.on('exit-kiosk', (_, adminPassword) => {
  // Emergency exit by teacher with master PIN
  if (adminPassword === 'teacher@123') {
    app.quit();
  }
});

app.whenReady().then(() => {
  createWindow();

  // Register OS-level Global Shortcuts to block Alt+Tab and Win keys
  const shortcutsToBlock = [
    'Alt+Tab',
    'Alt+F4',
    'Super',
    'CommandOrControl+Escape',
    'F11',
    'F12',
    'CommandOrControl+Shift+I',
    'CommandOrControl+R',
    'CommandOrControl+Shift+R',
    'CommandOrControl+W',
    'CommandOrControl+Q'
  ];

  shortcutsToBlock.forEach(shortcut => {
    try {
      globalShortcut.register(shortcut, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('kiosk-violation', {
            type: 'global_shortcut',
            message: `Phát hiện phím tắt toàn hệ thống: ${shortcut}`
          });
        }
      });
    } catch (e) {}
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (udpSocket) {
    try { udpSocket.close(); } catch (e) {}
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
