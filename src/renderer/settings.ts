// 설정 모듈 스코프
(function() {
  const { ipcRenderer } = require('electron');

  const intervalInput = document.getElementById('intervalInput') as HTMLInputElement;
  const stretchInput = document.getElementById('stretchInput') as HTMLInputElement;
  const soundCheckbox = document.getElementById('soundCheckbox') as HTMLInputElement;
  const autoStartCheckbox = document.getElementById('autoStartCheckbox') as HTMLInputElement;
  const cancelBtn = document.getElementById('cancelBtn') as HTMLButtonElement;
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  const resetPositionBtn = document.getElementById('resetPositionBtn') as HTMLButtonElement;
  const sizeRadios = document.querySelectorAll('input[name="uiSize"]') as NodeListOf<HTMLInputElement>;

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

  // Enter 키로 저장
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    } else if (e.key === 'Escape') {
      ipcRenderer.send('close-settings');
    }
  });

  // 위치 초기화 버튼
  resetPositionBtn.addEventListener('click', () => {
    ipcRenderer.send('reset-window-position');
  });

  // 설정 요청
  ipcRenderer.send('get-settings');
})();
