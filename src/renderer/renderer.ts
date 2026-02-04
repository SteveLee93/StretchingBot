// 렌더러 모듈 스코프
(function() {
  const { ipcRenderer } = require('electron');

  const container = document.getElementById('container') as HTMLDivElement;
  const timeDisplay = document.getElementById('timeDisplay') as HTMLSpanElement;
  const toggleBtn = document.getElementById('toggleBtn') as HTMLButtonElement;
  const completeBtn = document.getElementById('completeBtn') as HTMLButtonElement;
  const stretchTimer = document.getElementById('stretchTimer') as HTMLSpanElement;

  let isAlarmState = false;
  let stretchCountdown: NodeJS.Timeout | null = null;

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateSizeClass(size: number): void {
    container.classList.remove('size-1', 'size-2', 'size-3');
    container.classList.add(`size-${size}`);
  }

  // 타이머 업데이트 수신
  ipcRenderer.on('timer-update', (_event: any, data: { remainingSeconds: number; isRunning: boolean; intervalMinutes: number }) => {
    if (isAlarmState) return;

    timeDisplay.textContent = formatTime(data.remainingSeconds);
    toggleBtn.textContent = data.isRunning ? '⏸' : '▶';
  });

  // UI 크기 변경 수신
  ipcRenderer.on('ui-size-changed', (_event: any, size: number) => {
    updateSizeClass(size);
  });

  // 알람 트리거 수신
  ipcRenderer.on('alarm-triggered', (_event: any, data: { stretchSeconds: number }) => {
    isAlarmState = true;
    container.classList.add('alarm');
    startStretchCountdown(data.stretchSeconds);
  });

  // 알람 소리 재생
  ipcRenderer.on('play-alarm-sound', () => {
    playAlarmSound();
  });

  // 토글 버튼 클릭
  toggleBtn.addEventListener('click', () => {
    ipcRenderer.send('toggle-timer');
  });

  // 완료 버튼 클릭
  completeBtn.addEventListener('click', () => {
    if (completeBtn.disabled) return;

    isAlarmState = false;
    container.classList.remove('alarm');
    resetStretchUI();
    ipcRenderer.send('complete-stretching');
  });

  // 스트레칭 카운트다운 시작
  function startStretchCountdown(duration: number): void {
    let remaining = duration;
    stretchTimer.textContent = remaining.toString();
    stretchTimer.style.display = 'block';
    completeBtn.disabled = true;
    completeBtn.textContent = '대기중...';

    stretchCountdown = setInterval(() => {
      remaining--;

      if (remaining <= 0) {
        if (stretchCountdown) {
          clearInterval(stretchCountdown);
          stretchCountdown = null;
        }
        stretchTimer.style.display = 'none';
        completeBtn.disabled = false;
        completeBtn.textContent = '스트레칭 완료';
      } else {
        stretchTimer.textContent = remaining.toString();
      }
    }, 1000);
  }

  // 스트레칭 UI 초기화
  function resetStretchUI(): void {
    if (stretchCountdown) {
      clearInterval(stretchCountdown);
      stretchCountdown = null;
    }
    stretchTimer.style.display = 'block';
    stretchTimer.textContent = '5';
    completeBtn.disabled = true;
    completeBtn.textContent = '대기중...';
  }

  // 알람 소리 재생 함수
  function playAlarmSound(): void {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 600;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);

    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();

      osc2.connect(gain2);
      gain2.connect(audioContext.destination);

      osc2.frequency.value = 800;
      osc2.type = 'sine';

      gain2.gain.setValueAtTime(0.2, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.3);
    }, 200);
  }

  // 초기 상태 요청
  ipcRenderer.send('get-timer-state');
})();
