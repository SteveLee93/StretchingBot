import { app, BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';
import { createTray, updateTrayMenu, destroyTray } from './tray';
import * as store from './store';
import { UI_SIZES, Alarm } from './store';

let mainWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let alarmWindow: BrowserWindow | null = null;  // 커스텀 알람 전용 윈도우
let timerInterval: NodeJS.Timeout | null = null;
let remainingSeconds: number = 0;
let isTimerRunning: boolean = false;
let isPaused: boolean = false;
let isAlarmActive: boolean = false;  // 스트레칭 알람 상태만 관리

// 알람 관련 변수
let alarmCheckInterval: NodeJS.Timeout | null = null;
let activeTimerAlarms: Map<string, { timeout: NodeJS.Timeout; triggerAt: number }> = new Map();
let pendingAlarmData: { title: string; waitSeconds: number; alarmId: string; soundEnabled: boolean } | null = null;
let lastCheckedMinute: number = -1;  // 마지막으로 체크한 분

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
    height: 620,
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

// 커스텀 알람 전용 윈도우 생성
function createAlarmWindow(alarm: Alarm): void {
  // 이미 알람 윈도우가 열려있으면 무시
  if (alarmWindow) return;

  // 마지막 트리거 시간 업데이트
  store.updateAlarm(alarm.id, { lastTriggered: new Date().toISOString() });

  // 알람 데이터 저장 (윈도우 로드 후 전송용)
  pendingAlarmData = {
    title: alarm.title,
    waitSeconds: alarm.waitSeconds,
    alarmId: alarm.id,
    soundEnabled: alarm.soundEnabled
  };

  const { width, height } = getWindowSize(true);

  // 화면 중앙 위치 계산
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  const x = Math.round((screenWidth - width) / 2);
  const y = Math.round((screenHeight - height) / 2);

  alarmWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
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

  alarmWindow.loadFile(path.join(__dirname, '../renderer/alarm.html'));

  alarmWindow.webContents.on('did-finish-load', () => {
    if (alarmWindow && pendingAlarmData) {
      // UI 크기 전송
      alarmWindow.webContents.send('ui-size-changed', store.getUiSize());
      // 알람 데이터 전송
      alarmWindow.webContents.send('alarm-data', pendingAlarmData);
      // 소리 재생
      if (pendingAlarmData.soundEnabled) {
        alarmWindow.webContents.send('play-alarm-sound');
      }
    }
  });

  // 윈도우 깜빡임
  alarmWindow.flashFrame(true);
  alarmWindow.show();
  alarmWindow.focus();

  alarmWindow.on('closed', () => {
    alarmWindow = null;
    pendingAlarmData = null;
  });
}

// 커스텀 알람 트리거
function triggerCustomAlarm(alarm: Alarm): void {
  createAlarmWindow(alarm);
}

// 알람 스케줄러 시작 (시간 기반 알람 체크)
function startAlarmScheduler(): void {
  if (alarmCheckInterval) return;

  // 1초마다 체크하되, 분이 바뀔 때만 알람 확인
  alarmCheckInterval = setInterval(() => {
    const now = new Date();
    const currentMinute = now.getMinutes();

    // 분이 바뀌었을 때만 체크
    if (currentMinute !== lastCheckedMinute) {
      lastCheckedMinute = currentMinute;
      checkTimeBasedAlarms();
    }
  }, 1000);  // 1초마다 체크

  // 즉시 한 번 체크
  const now = new Date();
  lastCheckedMinute = now.getMinutes();
  checkTimeBasedAlarms();
}

// 시간 기반 알람 체크
function checkTimeBasedAlarms(): void {
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const currentDay = now.getDay() as store.DayOfWeek;
  const todayDateStr = now.toISOString().split('T')[0];

  const alarms = store.getAlarms();

  for (const alarm of alarms) {
    if (!alarm.enabled || alarm.type !== 'time' || !alarm.time) continue;

    // 시간 매칭
    if (alarm.time !== currentTime) continue;

    // 반복 요일 체크
    if (alarm.repeatDays && alarm.repeatDays.length > 0) {
      if (!alarm.repeatDays.includes(currentDay)) continue;
    }

    // 오늘 이미 트리거되었는지 체크 (중복 방지)
    if (alarm.lastTriggered) {
      const lastDate = alarm.lastTriggered.split('T')[0];
      if (lastDate === todayDateStr) continue;
    }

    // 알람 트리거
    triggerCustomAlarm(alarm);

    // 일회성 알람이면 비활성화
    if (!alarm.repeatDays || alarm.repeatDays.length === 0) {
      store.updateAlarm(alarm.id, { enabled: false });
      // 설정창 열려있으면 업데이트
      if (settingsWindow) {
        settingsWindow.webContents.send('alarms-data', store.getAlarms());
      }
    }

    break;  // 한 번에 하나씩만 트리거
  }
}

// 타이머 알람 초기화
function initializeTimerAlarms(): void {
  // 기존 타이머 정리
  activeTimerAlarms.forEach(({ timeout }) => clearTimeout(timeout));
  activeTimerAlarms.clear();

  const alarms = store.getAlarms();

  for (const alarm of alarms) {
    if (!alarm.enabled || alarm.type !== 'timer' || !alarm.timerMinutes) continue;
    scheduleTimerAlarm(alarm);
  }
}

// 개별 타이머 알람 설정
function scheduleTimerAlarm(alarm: Alarm): void {
  if (!alarm.timerMinutes) return;

  const alarmId = alarm.id;
  const timerMs = alarm.timerMinutes * 60 * 1000;
  const triggerAt = Date.now() + timerMs;

  const timeout = setTimeout(() => {
    // 최신 알람 정보 가져오기
    const currentAlarms = store.getAlarms();
    const currentAlarm = currentAlarms.find(a => a.id === alarmId);

    activeTimerAlarms.delete(alarmId);

    if (!currentAlarm || !currentAlarm.enabled) return;

    triggerCustomAlarm(currentAlarm);

    // 반복 설정 (타이머 알람은 트리거 후 다시 설정)
    scheduleTimerAlarm(currentAlarm);
  }, timerMs);

  activeTimerAlarms.set(alarmId, { timeout, triggerAt });
}

// 타이머 알람 남은 시간 정보 가져오기
function getTimerAlarmsRemainingTime(): { [alarmId: string]: number } {
  const result: { [alarmId: string]: number } = {};
  const now = Date.now();

  activeTimerAlarms.forEach(({ triggerAt }, alarmId) => {
    const remaining = Math.max(0, triggerAt - now);
    result[alarmId] = remaining;
  });

  return result;
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

// 알람 관련 IPC 핸들러
ipcMain.on('get-alarms', (event) => {
  event.reply('alarms-data', store.getAlarms());
  event.reply('timer-remaining', getTimerAlarmsRemainingTime());
});

ipcMain.on('save-alarm', (_event, alarm: Alarm) => {
  const alarms = store.getAlarms();
  const existingIndex = alarms.findIndex(a => a.id === alarm.id);

  // 저장 시 lastTriggered 초기화 (다시 트리거될 수 있도록)
  alarm.lastTriggered = undefined;

  if (existingIndex !== -1) {
    // 수정 - 기존 알람을 완전히 교체
    alarms[existingIndex] = alarm;
    store.setAlarms(alarms);
  } else {
    // 추가
    store.addAlarm(alarm);
  }

  // 기존 타이머 취소
  const existing = activeTimerAlarms.get(alarm.id);
  if (existing) {
    clearTimeout(existing.timeout);
    activeTimerAlarms.delete(alarm.id);
  }

  // 타이머 알람이면 재스케줄
  if (alarm.type === 'timer' && alarm.enabled) {
    scheduleTimerAlarm(alarm);
  }

  // 설정창에 업데이트된 알람 목록 전송
  if (settingsWindow) {
    settingsWindow.webContents.send('alarms-data', store.getAlarms());
    settingsWindow.webContents.send('timer-remaining', getTimerAlarmsRemainingTime());
  }
});

ipcMain.on('delete-alarm', (_event, alarmId: string) => {
  // 타이머 취소
  const existing = activeTimerAlarms.get(alarmId);
  if (existing) {
    clearTimeout(existing.timeout);
    activeTimerAlarms.delete(alarmId);
  }

  store.deleteAlarm(alarmId);

  // 설정창에 업데이트된 알람 목록 전송
  if (settingsWindow) {
    settingsWindow.webContents.send('alarms-data', store.getAlarms());
    settingsWindow.webContents.send('timer-remaining', getTimerAlarmsRemainingTime());
  }
});

ipcMain.on('toggle-alarm', (_event, alarmId: string) => {
  store.toggleAlarmEnabled(alarmId);
  const alarms = store.getAlarms();
  const alarm = alarms.find(a => a.id === alarmId);

  if (alarm) {
    if (alarm.type === 'timer') {
      const existing = activeTimerAlarms.get(alarmId);
      if (alarm.enabled && !existing) {
        scheduleTimerAlarm(alarm);
      } else if (!alarm.enabled && existing) {
        clearTimeout(existing.timeout);
        activeTimerAlarms.delete(alarmId);
      }
    }
  }

  // 설정창에 업데이트된 알람 목록 전송
  if (settingsWindow) {
    settingsWindow.webContents.send('alarms-data', store.getAlarms());
    settingsWindow.webContents.send('timer-remaining', getTimerAlarmsRemainingTime());
  }
});

// 커스텀 알람 윈도우 관련 IPC 핸들러
ipcMain.on('get-alarm-data', (event) => {
  if (pendingAlarmData) {
    event.reply('alarm-data', pendingAlarmData);
  }
});

ipcMain.on('close-alarm-window', () => {
  if (alarmWindow) {
    alarmWindow.flashFrame(false);
    alarmWindow.close();
    alarmWindow = null;
    pendingAlarmData = null;
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

  // 알람 스케줄러 시작
  startAlarmScheduler();
  initializeTimerAlarms();
});

app.on('window-all-closed', () => {
  // macOS가 아니면 앱 종료하지 않음 (트레이에서 계속 실행)
});

app.on('before-quit', () => {
  destroyTray();
  if (timerInterval) {
    clearInterval(timerInterval);
  }
  if (alarmCheckInterval) {
    clearInterval(alarmCheckInterval);
  }
  activeTimerAlarms.forEach(({ timeout }) => clearTimeout(timeout));
  activeTimerAlarms.clear();
});

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createMainWindow();
  }
});
