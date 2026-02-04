// 알람 팝업 모듈 스코프
(function() {
  const { ipcRenderer } = require('electron');

  const container = document.getElementById('container') as HTMLDivElement;
  const alarmTitle = document.getElementById('alarmTitle') as HTMLSpanElement;
  const waitTimer = document.getElementById('waitTimer') as HTMLSpanElement;
  const completeBtn = document.getElementById('completeBtn') as HTMLButtonElement;

  let waitCountdown: NodeJS.Timeout | null = null;

  function updateSizeClass(size: number): void {
    container.classList.remove('size-1', 'size-2', 'size-3');
    container.classList.add(`size-${size}`);
  }

  // 알람 데이터 수신
  ipcRenderer.on('alarm-data', (_event: any, data: { title: string; waitSeconds: number; alarmId: string }) => {
    alarmTitle.textContent = data.title;
    startWaitCountdown(data.waitSeconds);
  });

  // UI 크기 변경 수신
  ipcRenderer.on('ui-size-changed', (_event: any, size: number) => {
    updateSizeClass(size);
  });

  // 알람 소리 재생
  ipcRenderer.on('play-alarm-sound', () => {
    playAlarmSound();
  });

  // 대기 카운트다운 시작
  function startWaitCountdown(duration: number): void {
    let remaining = duration;
    waitTimer.textContent = remaining.toString();
    waitTimer.style.display = 'block';
    completeBtn.disabled = true;
    completeBtn.textContent = '대기중...';

    waitCountdown = setInterval(() => {
      remaining--;

      if (remaining <= 0) {
        if (waitCountdown) {
          clearInterval(waitCountdown);
          waitCountdown = null;
        }
        waitTimer.style.display = 'none';
        completeBtn.disabled = false;
        completeBtn.textContent = '확인';
      } else {
        waitTimer.textContent = remaining.toString();
      }
    }, 1000);
  }

  // 완료 버튼 클릭
  completeBtn.addEventListener('click', () => {
    if (completeBtn.disabled) return;

    if (waitCountdown) {
      clearInterval(waitCountdown);
      waitCountdown = null;
    }

    ipcRenderer.send('close-alarm-window');
  });

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
  ipcRenderer.send('get-alarm-data');
})();
