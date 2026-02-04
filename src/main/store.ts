// electron-store는 ESM이므로 동적 임포트 필요
let store: any = null;

interface StoreSchema {
  intervalMinutes: number;
  stretchSeconds: number;
  soundEnabled: boolean;
  autoStart: boolean;
  uiSize: number; // 1: 작음, 2: 보통, 3: 큼
  windowPosition: { x: number; y: number } | null;
}

const defaults: StoreSchema = {
  intervalMinutes: 30,
  stretchSeconds: 5,
  soundEnabled: true,
  autoStart: false,
  uiSize: 2,
  windowPosition: null
};

// 크기별 윈도우 치수 (Windows 최소 크기 제한 고려)
export const UI_SIZES: { [key: number]: { normal: { width: number; height: number }; alarm: { width: number; height: number } } } = {
  1: { normal: { width: 145, height: 48 }, alarm: { width: 200, height: 95 } },
  2: { normal: { width: 175, height: 56 }, alarm: { width: 240, height: 110 } },
  3: { normal: { width: 210, height: 68 }, alarm: { width: 290, height: 130 } }
};

async function initStore(): Promise<void> {
  if (store) return;
  const Store = (await import('electron-store')).default;
  store = new Store<StoreSchema>({ defaults });
}

// 동기 버전 (초기화 후 사용)
function getStore(): any {
  if (!store) {
    // 동기적으로 require 시도
    try {
      const Store = require('electron-store').default || require('electron-store');
      store = new Store({ defaults });
    } catch {
      return { get: (key: keyof StoreSchema) => defaults[key], set: () => {} };
    }
  }
  return store;
}

export function getIntervalMinutes(): number {
  return getStore().get('intervalMinutes') ?? defaults.intervalMinutes;
}

export function setIntervalMinutes(minutes: number): void {
  getStore().set('intervalMinutes', minutes);
}

export function getStretchSeconds(): number {
  return getStore().get('stretchSeconds') ?? defaults.stretchSeconds;
}

export function setStretchSeconds(seconds: number): void {
  getStore().set('stretchSeconds', seconds);
}

export function getSoundEnabled(): boolean {
  return getStore().get('soundEnabled') ?? defaults.soundEnabled;
}

export function setSoundEnabled(enabled: boolean): void {
  getStore().set('soundEnabled', enabled);
}

export function getAutoStart(): boolean {
  return getStore().get('autoStart') ?? defaults.autoStart;
}

export function setAutoStart(enabled: boolean): void {
  getStore().set('autoStart', enabled);
}

export function getUiSize(): number {
  return getStore().get('uiSize') ?? defaults.uiSize;
}

export function setUiSize(size: number): void {
  getStore().set('uiSize', size);
}

export function getWindowPosition(): { x: number; y: number } | null {
  return getStore().get('windowPosition') ?? defaults.windowPosition;
}

export function setWindowPosition(position: { x: number; y: number }): void {
  getStore().set('windowPosition', position);
}

export { initStore };
