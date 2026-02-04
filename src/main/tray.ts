import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import * as path from 'path';

let tray: Tray | null = null;

export function createTray(
  mainWindow: BrowserWindow,
  settingsWindow: BrowserWindow | null,
  openSettings: () => void,
  toggleTimer: () => void,
  isRunning: () => boolean
): Tray {
  // 간단한 아이콘 생성 (16x16 녹색 원)
  const iconPath = path.join(__dirname, '../../assets/icon.png');
  let icon: Electron.NativeImage;

  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = createDefaultIcon();
    }
  } catch {
    icon = createDefaultIcon();
  }

  tray = new Tray(icon);
  tray.setToolTip('StretchingBot - 스트레칭 알람');

  const updateContextMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: isRunning() ? '⏸ 일시정지' : '▶ 시작',
        click: toggleTimer
      },
      { type: 'separator' },
      {
        label: '⚙ 설정',
        click: openSettings
      },
      {
        label: mainWindow.isVisible() ? '🔽 미니 윈도우 숨기기' : '🔼 미니 윈도우 표시',
        click: () => {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
          }
          updateContextMenu();
        }
      },
      { type: 'separator' },
      {
        label: '❌ 종료',
        click: () => {
          app.quit();
        }
      }
    ]);
    tray?.setContextMenu(contextMenu);
  };

  updateContextMenu();

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
    updateContextMenu();
  });

  // 더블클릭으로 윈도우 토글
  tray.on('double-click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
    updateContextMenu();
  });

  return tray;
}

function createDefaultIcon(): Electron.NativeImage {
  // 16x16 녹색 아이콘 생성
  const size = 16;
  const canvas = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const cx = size / 2;
      const cy = size / 2;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);

      if (dist < size / 2 - 1) {
        // 녹색 원
        canvas[idx] = 76;     // R
        canvas[idx + 1] = 175; // G
        canvas[idx + 2] = 80;  // B
        canvas[idx + 3] = 255; // A
      } else {
        // 투명
        canvas[idx] = 0;
        canvas[idx + 1] = 0;
        canvas[idx + 2] = 0;
        canvas[idx + 3] = 0;
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

export function updateTrayMenu(
  mainWindow: BrowserWindow,
  openSettings: () => void,
  toggleTimer: () => void,
  isRunning: () => boolean
): void {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: isRunning() ? '⏸ 일시정지' : '▶ 시작',
      click: toggleTimer
    },
    { type: 'separator' },
    {
      label: '⚙ 설정',
      click: openSettings
    },
    {
      label: mainWindow.isVisible() ? '🔽 미니 윈도우 숨기기' : '🔼 미니 윈도우 표시',
      click: () => {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
        }
        updateTrayMenu(mainWindow, openSettings, toggleTimer, isRunning);
      }
    },
    { type: 'separator' },
    {
      label: '❌ 종료',
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
