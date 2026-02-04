# StretchingBot

Windows용 스트레칭 알람 봇 - 일정 간격으로 스트레칭을 알려주는 데스크톱 앱

## 기능

- 미니 윈도우로 항상 화면 위에 표시
- 설정 가능한 알람 간격 (1~120분)
- 스트레칭 대기 시간 설정
- 시스템 트레이 지원
- Windows 시작 시 자동 실행 옵션
- UI 크기 조절 (S/M/L)
- 다크 테마 미니멀 디자인

## 설치

### 방법 1: 설치 프로그램
`StretchingBot-Setup.exe` 실행

### 방법 2: 포터블
`StretchingBot-Portable.exe`를 원하는 폴더에 복사 후 실행

## 개발

```bash
# 의존성 설치
npm install

# 개발 모드 실행
npm run dev

# 배포 빌드
npm run dist
```

## 기술 스택

- Electron
- TypeScript
- electron-store
- electron-builder

## 라이선스

MIT
