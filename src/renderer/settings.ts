// 설정 모듈 스코프
(function() {
  const { ipcRenderer } = require('electron');

  // 알람 타입 정의
  type AlarmType = 'time' | 'timer';
  type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

  interface Alarm {
    id: string;
    title: string;
    type: AlarmType;
    enabled: boolean;
    time?: string;
    repeatDays?: DayOfWeek[];
    timerMinutes?: number;
    waitSeconds: number;
    soundEnabled: boolean;
    lastTriggered?: string;
  }

  const intervalInput = document.getElementById('intervalInput') as HTMLInputElement;
  const stretchInput = document.getElementById('stretchInput') as HTMLInputElement;
  const soundCheckbox = document.getElementById('soundCheckbox') as HTMLInputElement;
  const autoStartCheckbox = document.getElementById('autoStartCheckbox') as HTMLInputElement;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  const resetPositionBtn = document.getElementById('resetPositionBtn') as HTMLButtonElement;
  const sizeRadios = document.querySelectorAll('input[name="uiSize"]') as NodeListOf<HTMLInputElement>;

  // 알람 관련 요소들
  const addAlarmBtn = document.getElementById('addAlarmBtn') as HTMLButtonElement;
  const alarmList = document.getElementById('alarmList') as HTMLDivElement;
  const alarmEditOverlay = document.getElementById('alarmEditOverlay') as HTMLDivElement;
  const alarmModalTitle = document.getElementById('alarmModalTitle') as HTMLDivElement;
  const alarmTitleInput = document.getElementById('alarmTitleInput') as HTMLInputElement;
  const alarmTypeRadios = document.querySelectorAll('input[name="alarmType"]') as NodeListOf<HTMLInputElement>;
  const alarmTimeFields = document.getElementById('alarmTimeFields') as HTMLDivElement;
  const alarmTimerFields = document.getElementById('alarmTimerFields') as HTMLDivElement;
  const alarmTimeInput = document.getElementById('alarmTimeInput') as HTMLInputElement;
  const daySelector = document.getElementById('daySelector') as HTMLDivElement;
  const alarmTimerInput = document.getElementById('alarmTimerInput') as HTMLInputElement;
  const alarmWaitInput = document.getElementById('alarmWaitInput') as HTMLInputElement;
  const alarmSoundCheckbox = document.getElementById('alarmSoundCheckbox') as HTMLInputElement;
  const alarmCancelBtn = document.getElementById('alarmCancelBtn') as HTMLButtonElement;
  const alarmSaveBtn = document.getElementById('alarmSaveBtn') as HTMLButtonElement;

  let alarms: Alarm[] = [];
  let editingAlarmId: string | null = null;
  let timerRemainingTimes: { [alarmId: string]: number } = {};
  let timerUpdateInterval: NodeJS.Timeout | null = null;

  // 설정 데이터 수신
  ipcRenderer.on('settings-data', (_event: any, data: { intervalMinutes: number; stretchSeconds: number; soundEnabled: boolean; autoStart: boolean; uiSize: number }) => {
    intervalInput.value = data.intervalMinutes.toString();
    stretchInput.value = data.stretchSeconds.toString();
    soundCheckbox.checked = data.soundEnabled;
    autoStartCheckbox.checked = data.autoStart;

    // UI 크기 라디오 버튼 설정
    sizeRadios.forEach(radio => {
      radio.checked = parseInt(radio.value, 10) === data.uiSize;
    });
  });

  // 저장 함수
  function saveSettings(): void {
    const interval = parseInt(intervalInput.value, 10);
    const stretch = parseInt(stretchInput.value, 10);

    if (isNaN(interval) || interval < 1 || interval > 120) {
      alert('알람 간격은 1분에서 120분 사이로 설정해주세요.');
      return;
    }

    if (isNaN(stretch) || stretch < 1 || stretch > 300) {
      alert('대기 시간은 1초에서 300초 사이로 설정해주세요.');
      return;
    }

    let selectedSize = 2;
    sizeRadios.forEach(radio => {
      if (radio.checked) {
        selectedSize = parseInt(radio.value, 10);
      }
    });

    ipcRenderer.send('save-settings', {
      intervalMinutes: interval,
      stretchSeconds: stretch,
      soundEnabled: soundCheckbox.checked,
      autoStart: autoStartCheckbox.checked,
      uiSize: selectedSize
    });
  }

  // 취소 버튼
  cancelBtn.addEventListener('click', () => {
    ipcRenderer.send('close-settings');
  });

  // 저장 버튼
  saveBtn.addEventListener('click', saveSettings);

  // Enter 키로 저장 (모달이 열려있지 않을 때만)
  document.addEventListener('keydown', (e) => {
    const isModalOpen = alarmEditOverlay.classList.contains('show');

    if (e.key === 'Enter' && !isModalOpen) {
      saveSettings();
    } else if (e.key === 'Escape') {
      if (isModalOpen) {
        closeModal();
      } else {
        ipcRenderer.send('close-settings');
      }
    }
  });

  // 위치 초기화 버튼
  resetPositionBtn.addEventListener('click', () => {
    ipcRenderer.send('reset-window-position');
  });

  // 설정 요청
  ipcRenderer.send('get-settings');
  ipcRenderer.send('get-alarms');

  // 알람 데이터 수신
  ipcRenderer.on('alarms-data', (_event: any, data: Alarm[]) => {
    alarms = data;
    renderAlarmList();
  });

  // 타이머 남은 시간 수신
  ipcRenderer.on('timer-remaining', (_event: any, data: { [alarmId: string]: number }) => {
    timerRemainingTimes = data;
    updateTimerDisplays();
    startTimerUpdateInterval();
  });

  // 타이머 표시 업데이트 인터벌 시작
  function startTimerUpdateInterval(): void {
    if (timerUpdateInterval) return;

    timerUpdateInterval = setInterval(() => {
      // 남은 시간 1초씩 감소
      Object.keys(timerRemainingTimes).forEach(id => {
        if (timerRemainingTimes[id] > 0) {
          timerRemainingTimes[id] -= 1000;
        }
      });
      updateTimerDisplays();
    }, 1000);
  }

  // 타이머 표시 업데이트
  function updateTimerDisplays(): void {
    alarmList.querySelectorAll('.alarm-item').forEach(item => {
      const id = item.getAttribute('data-id');
      if (!id) return;

      const alarm = alarms.find(a => a.id === id);
      if (!alarm || alarm.type !== 'timer') return;

      const detailEl = item.querySelector('.alarm-item-detail');
      if (!detailEl) return;

      const remaining = timerRemainingTimes[id];
      if (remaining !== undefined && remaining > 0 && alarm.enabled) {
        detailEl.textContent = `${alarm.timerMinutes}분 간격 (${formatRemainingTime(remaining)} 후)`;
      } else if (alarm.enabled) {
        detailEl.textContent = `${alarm.timerMinutes}분 간격`;
      } else {
        detailEl.textContent = `${alarm.timerMinutes}분 간격 (비활성)`;
      }
    });
  }

  // 남은 시간 포맷 (밀리초 -> "M분 S초" 또는 "S초")
  function formatRemainingTime(ms: number): string {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes > 0) {
      return `${minutes}분 ${seconds}초`;
    }
    return `${seconds}초`;
  }

  // 알람 목록 렌더링
  function renderAlarmList(): void {
    if (alarms.length === 0) {
      alarmList.innerHTML = '<div class="alarm-empty">등록된 알람이 없습니다</div>';
      return;
    }

    alarmList.innerHTML = alarms.map(alarm => {
      const detail = alarm.type === 'time'
        ? `${alarm.time} ${formatRepeatDays(alarm.repeatDays)}`
        : `${alarm.timerMinutes}분 간격`;

      return `
        <div class="alarm-item" data-id="${alarm.id}">
          <div class="alarm-item-info">
            <span class="alarm-item-title">${escapeHtml(alarm.title)}</span>
            <span class="alarm-item-detail">${detail}</span>
          </div>
          <div class="alarm-item-actions">
            <input type="checkbox" class="alarm-toggle" ${alarm.enabled ? 'checked' : ''}>
            <button class="btn-alarm-edit">✎</button>
            <button class="btn-alarm-delete">✕</button>
          </div>
        </div>
      `;
    }).join('');

    // 이벤트 리스너 연결
    alarmList.querySelectorAll('.alarm-item').forEach(item => {
      const id = item.getAttribute('data-id')!;

      item.querySelector('.alarm-toggle')?.addEventListener('change', () => {
        ipcRenderer.send('toggle-alarm', id);
      });

      item.querySelector('.btn-alarm-edit')?.addEventListener('click', () => {
        openEditModal(id);
      });

      item.querySelector('.btn-alarm-delete')?.addEventListener('click', () => {
        if (confirm('알람을 삭제하시겠습니까?')) {
          ipcRenderer.send('delete-alarm', id);
        }
      });
    });
  }

  // 반복 요일 포맷
  function formatRepeatDays(days?: DayOfWeek[]): string {
    if (!days || days.length === 0) return '(일회성)';
    if (days.length === 7) return '(매일)';
    if (days.length === 5 && !days.includes(0) && !days.includes(6)) return '(평일)';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return '(주말)';

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `(${days.map(d => dayNames[d]).join(', ')})`;
  }

  // HTML 이스케이프
  function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // UUID 생성
  function generateId(): string {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
  }

  // 알람 추가 버튼
  addAlarmBtn.addEventListener('click', () => {
    openAddModal();
  });

  // 추가 모달 열기
  function openAddModal(): void {
    editingAlarmId = null;
    alarmModalTitle.textContent = '알람 추가';

    // 폼 초기화
    alarmTitleInput.value = '';
    (document.querySelector('input[name="alarmType"][value="time"]') as HTMLInputElement).checked = true;
    updateTypeFields();
    alarmTimeInput.value = '';
    alarmTimerInput.value = '30';
    alarmWaitInput.value = '5';
    alarmSoundCheckbox.checked = true;
    clearDaySelection();

    alarmEditOverlay.classList.add('show');
  }

  // 편집 모달 열기
  function openEditModal(id: string): void {
    const alarm = alarms.find(a => a.id === id);
    if (!alarm) return;

    editingAlarmId = id;
    alarmModalTitle.textContent = '알람 수정';

    // 폼 채우기
    alarmTitleInput.value = alarm.title;
    (document.querySelector(`input[name="alarmType"][value="${alarm.type}"]`) as HTMLInputElement).checked = true;
    updateTypeFields();

    if (alarm.type === 'time') {
      alarmTimeInput.value = alarm.time || '';
      setDaySelection(alarm.repeatDays || []);
    } else {
      alarmTimerInput.value = (alarm.timerMinutes || 30).toString();
    }

    alarmWaitInput.value = alarm.waitSeconds.toString();
    alarmSoundCheckbox.checked = alarm.soundEnabled;

    alarmEditOverlay.classList.add('show');
  }

  // 모달 닫기
  function closeModal(): void {
    alarmEditOverlay.classList.remove('show');
    editingAlarmId = null;
  }

  alarmCancelBtn.addEventListener('click', closeModal);

  alarmEditOverlay.addEventListener('click', (e) => {
    if (e.target === alarmEditOverlay) {
      closeModal();
    }
  });

  // 알람 타입 변경
  alarmTypeRadios.forEach(radio => {
    radio.addEventListener('change', updateTypeFields);
  });

  function updateTypeFields(): void {
    const selectedType = (document.querySelector('input[name="alarmType"]:checked') as HTMLInputElement).value;
    if (selectedType === 'time') {
      alarmTimeFields.classList.add('show');
      alarmTimerFields.classList.remove('show');
    } else {
      alarmTimeFields.classList.remove('show');
      alarmTimerFields.classList.add('show');
    }
  }

  // 요일 선택
  daySelector.querySelectorAll('.day-option').forEach(option => {
    option.addEventListener('click', () => {
      option.classList.toggle('selected');
    });
  });

  function clearDaySelection(): void {
    daySelector.querySelectorAll('.day-option').forEach(option => {
      option.classList.remove('selected');
    });
  }

  function setDaySelection(days: DayOfWeek[]): void {
    clearDaySelection();
    days.forEach(day => {
      const option = daySelector.querySelector(`[data-day="${day}"]`);
      if (option) option.classList.add('selected');
    });
  }

  function getSelectedDays(): DayOfWeek[] {
    const days: DayOfWeek[] = [];
    daySelector.querySelectorAll('.day-option.selected').forEach(option => {
      const day = parseInt(option.getAttribute('data-day')!, 10) as DayOfWeek;
      days.push(day);
    });
    return days.sort((a, b) => a - b);
  }

  // 알람 저장
  alarmSaveBtn.addEventListener('click', () => {
    const title = alarmTitleInput.value.trim();
    if (!title) {
      alert('알람 제목을 입력해주세요.');
      return;
    }

    const type = (document.querySelector('input[name="alarmType"]:checked') as HTMLInputElement).value as AlarmType;

    let time: string | undefined;
    let repeatDays: DayOfWeek[] | undefined;
    let timerMinutes: number | undefined;

    if (type === 'time') {
      time = alarmTimeInput.value;
      if (!time) {
        alert('알람 시간을 입력해주세요.');
        return;
      }
      repeatDays = getSelectedDays();
    } else {
      const timer = parseInt(alarmTimerInput.value, 10);
      if (isNaN(timer) || timer < 1 || timer > 1440) {
        alert('타이머는 1분에서 1440분(24시간) 사이로 설정해주세요.');
        return;
      }
      timerMinutes = timer;
    }

    const wait = parseInt(alarmWaitInput.value, 10);
    if (isNaN(wait) || wait < 1 || wait > 300) {
      alert('대기 시간은 1초에서 300초 사이로 설정해주세요.');
      return;
    }

    const alarm: Alarm = {
      id: editingAlarmId || generateId(),
      title,
      type,
      enabled: editingAlarmId ? (alarms.find(a => a.id === editingAlarmId)?.enabled ?? true) : true,
      time,
      repeatDays,
      timerMinutes,
      waitSeconds: wait,
      soundEnabled: alarmSoundCheckbox.checked
    };

    ipcRenderer.send('save-alarm', alarm);
    closeModal();
  });
})();
