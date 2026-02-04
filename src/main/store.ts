// electron-store는 ESM이므로 동적 임포트 필요
let store: any = null;

// 알람 타입 정의
export type AlarmType = 'time' | 'timer';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;  // 0=일, 6=토

export interface Alarm {
  id: string;                    // UUID
  title: string;                 // 알람 제목 (최대 20자)
  type: AlarmType;
  enabled: boolean;

  // 시간 기반 알람
  time?: string;                 // 'HH:MM' 형식
  repeatDays?: DayOfWeek[];      // 반복 요일 (빈 배열 = 일회성)

  // 타이머 기반 알람
  timerMinutes?: number;         // N분 후

  // 공통
  waitSeconds: number;           // 대기 시간 (기존 stretchSeconds와 동일 개념)
  soundEnabled: boolean;
  lastTriggered?: string;        // ISO 날짜 (중복 실행 방지)
}

interface StoreSchema {
  intervalMinutes: number;
  stretchSeconds: number;
  soundEnabled: boolean;
  autoStart: boolean;
  uiSize: number; // 1: 작음, 2: 보통, 3: 큼
  windowPosition: { x: number; y: number } | null;
  alarms: Alarm[];
}

const defaults: StoreSchema = {
  intervalMinutes: 30,
  stretchSeconds: 5,
  soundEnabled: true,
  autoStart: false,
  uiSize: 2,
  windowPosition: null,
  alarms: []
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

// 알람 관련 함수들
export function getAlarms(): Alarm[] {
  return getStore().get('alarms') ?? defaults.alarms;
}

export function setAlarms(alarms: Alarm[]): void {
  getStore().set('alarms', alarms);
}

export function addAlarm(alarm: Alarm): void {
  const alarms = getAlarms();
  alarms.push(alarm);
  setAlarms(alarms);
}

export function updateAlarm(alarmId: string, updates: Partial<Alarm>): void {
  const alarms = getAlarms();
  const index = alarms.findIndex(a => a.id === alarmId);
  if (index !== -1) {
    alarms[index] = { ...alarms[index], ...updates };
    setAlarms(alarms);
  }
}

export function deleteAlarm(alarmId: string): void {
  const alarms = getAlarms();
  const filtered = alarms.filter(a => a.id !== alarmId);
  setAlarms(filtered);
}

export function toggleAlarmEnabled(alarmId: string): void {
  const alarms = getAlarms();
  const index = alarms.findIndex(a => a.id === alarmId);
  if (index !== -1) {
    alarms[index].enabled = !alarms[index].enabled;
    setAlarms(alarms);
  }
}

export { initStore };
