import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import { createTray, updateTrayMenu, destroyTray } from './tray';
import * as store from './store';
import { UI_SIZES } from './store';

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let timerInterval: NodeJS.Timeout | null = null;
let remainingSeconds: number = 0;
let isTimerRunning: boolean = false;
let isPaused: boolean = false;
let isAlarmActive: boolean = false;

function getWindowSize(isAlarm: boolean = false): { width: number; height: number } {
  const size = store.getUiSize() as 1 | 2 | 3;
  const sizes = UI_SIZES[size] || UI_SIZES[2];
  return isAlarm ? sizes.alarm : sizes.normal;
}

function createMainWindow(): BrowserWindow {
  const savedPosition = store.getWindowPosition();
  const { width, height } = getWindowSize(false);

  const win = new BrowserWindow({
    width,
    height,
    x: savedPosition?.x,
    y: savedPosition?.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    useContentSize: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));

  // 윈도우 위치 저장 (알람 상태가 아닐 때만)
  win.on('moved', () => {
    if (!isAlarmActive) {
      const [x, y] = win.getPosition();
      store.setWindowPosition({ x, y });
    }
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // 초기 UI 크기 전송
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('ui-size-changed', store.getUiSize());
  });

  return win;
}

function createSettingsWindow(): void {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 300,
    height: 440,
    resizable: false,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  settingsWindow.setMenu(null);
  settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function startTimer(resetTime: boolean = true): void {
  if (isTimerRunning) return;

  isTimerRunning = true;

  // 새로 시작하거나 시간이 0이면 초기화
  if (resetTime || remainingSeconds <= 0) {
    remainingSeconds = store.getIntervalMinutes() * 60;
    isPaused = false;
  }

  updateMainWindow();

  timerInterval = setInterval(() => {
    remainingSeconds--;

    if (remainingSeconds <= 0) {
      triggerAlarm();
    } else {
      updateMainWindow();
    }
  }, 1000);

  if (mainWindow) {
    updateTrayMenu(mainWindow, openSettings, toggleTimer, () => isTimerRunning);
  }
}

function stopTimer(): void {
  if (!isTimerRunning) return;

  isTimerRunning = false;
  isPaused = true;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  if (mainWindow) {
    updateTrayMenu(mainWindow, openSettings, toggleTimer, () => isTimerRunning);
  }

  updateMainWindow();
}

function toggleTimer(): void {
  if (isTimerRunning) {
    stopTimer();
  } else {
    // 일시정지 상태면 남은 시간 유지, 아니면 새로 시작
    startTimer(!isPaused);
  }
}

function triggerAlarm(): void {
  // 타이머 정지
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isTimerRunning = false;
  isPaused = false;
  isAlarmActive = true;

  if (mainWindow) {
    // 알람 크기로 변경
    const { width, height } = getWindowSize(true);
    mainWindow.setSize(width, height);
    mainWindow.setContentSize(width, height);

    // 화면 중앙으로 이동
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
    const x = Math.round((screenWidth - width) / 2);
    const y = Math.round((screenHeight - height) / 2);
    mainWindow.setPosition(x, y);

    // 윈도우 깜빡임
    mainWindow.flashFrame(true);
    mainWindow.show();
    mainWindow.focus();

    // 알람 상태 전송 (스트레칭 시간 포함)
    mainWindow.webContents.send('alarm-triggered', {
      stretchSeconds: store.getStretchSeconds()
    });

    // 소리 재생 (활성화된 경우)
    if (store.getSoundEnabled()) {
      mainWindow.webContents.send('play-alarm-sound');
    }
  }

  if (mainWindow) {
    updateTrayMenu(mainWindow, openSettings, toggleTimer, () => isTimerRunning);
  }
}

function updateMainWindow(): void {
  if (mainWindow) {
    mainWindow.webContents.send('timer-update', {
      remainingSeconds,
      isRunning: isTimerRunning,
      intervalMinutes: store.getIntervalMinutes()
    });
  }
}

function openSettings(): void {
  createSettingsWindow();
}

// IPC 핸들러
ipcMain.on('toggle-timer', () => {
  toggleTimer();
});

ipcMain.on('complete-stretching', () => {
  isAlarmActive = false;
  if (mainWindow) {
    mainWindow.flashFrame(false);
    // 일반 크기로 복귀
    const { width, height } = getWindowSize(false);
    mainWindow.setSize(width, height);
    mainWindow.setContentSize(width, height);
    // 저장된 위치로 복귀
    const savedPosition = store.getWindowPosition();
    if (savedPosition) {
      mainWindow.setPosition(savedPosition.x, savedPosition.y);
    }
  }
  isPaused = false;
  startTimer(true);
});

ipcMain.on('get-settings', (event) => {
  event.reply('settings-data', {
    intervalMinutes: store.getIntervalMinutes(),
    stretchSeconds: store.getStretchSeconds(),
    soundEnabled: store.getSoundEnabled(),
    autoStart: store.getAutoStart(),
    uiSize: store.getUiSize()
  });
});

ipcMain.on('save-settings', (_event, settings: { intervalMinutes: number; stretchSeconds: number; soundEnabled: boolean; autoStart: boolean; uiSize: number }) => {
  const sizeChanged = store.getUiSize() !== settings.uiSize;
  const intervalChanged = store.getIntervalMinutes() !== settings.intervalMinutes;

  store.setIntervalMinutes(settings.intervalMinutes);
  store.setStretchSeconds(settings.stretchSeconds);
  store.setSoundEnabled(settings.soundEnabled);
  store.setAutoStart(settings.autoStart);
  store.setUiSize(settings.uiSize);

  // 자동 시작 설정
  app.setLoginItemSettings({
    openAtLogin: settings.autoStart,
    path: app.getPath('exe')
  });

  // UI 크기가 변경되면 윈도우 크기 업데이트
  if (sizeChanged && mainWindow) {
    const { width, height } = isAlarmActive ? getWindowSize(true) : getWindowSize(false);
    mainWindow.setSize(width, height);
    mainWindow.setContentSize(width, height);
    mainWindow.webContents.send('ui-size-changed', settings.uiSize);
  }

  // 알람 간격이 변경되었을 때만 타이머 재시작
  if (intervalChanged && isTimerRunning) {
    stopTimer();
    isPaused = false;
    startTimer(true);
  }

  if (settingsWindow) {
    settingsWindow.close();
  }
});

ipcMain.on('get-timer-state', (event) => {
  event.reply('timer-update', {
    remainingSeconds,
    isRunning: isTimerRunning,
    intervalMinutes: store.getIntervalMinutes()
  });
  // 크기 정보도 전송
  event.reply('ui-size-changed', store.getUiSize());
});

ipcMain.on('close-settings', () => {
  if (settingsWindow) {
    settingsWindow.close();
  }
});

ipcMain.on('reset-window-position', () => {
  if (mainWindow) {
    // 화면 중앙으로 이동
    mainWindow.center();
    const [x, y] = mainWindow.getPosition();
    store.setWindowPosition({ x, y });
  }
});

// 앱 준비
app.whenReady().then(() => {
  mainWindow = createMainWindow();

  createTray(
    mainWindow,
    settingsWindow,
    openSettings,
    toggleTimer,
    () => isTimerRunning
  );

  // 자동 시작
  startTimer(true);
});

app.on('window-all-closed', () => {
  // macOS가 아니면 앱 종료하지 않음 (트레이에서 계속 실행)
});

app.on('before-quit', () => {
  destroyTray();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  }
});
