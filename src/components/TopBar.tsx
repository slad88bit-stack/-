import React from 'react';
import {
  AudioLines,
  Camera,
  Download,
  EyeOff,
  Heart,
  Loader2,
  Mic,
  MicOff,
  MousePointer2,
  SlidersHorizontal,
  Video,
  VideoOff,
} from 'lucide-react';
import type { MicStatus, TelemetrySnapshot, WebcamStatus } from '../types/vtuber';

interface TopBarProps {
  webcamStatus: WebcamStatus;
  micStatus: MicStatus;
  mouseTracking: boolean;
  demoSpeech: boolean;
  drawerOpen: boolean;
  darkUi: boolean;
  telemetry: TelemetrySnapshot;
  onToggleWebcam: () => void;
  onToggleMic: () => void;
  onToggleMouse: () => void;
  onToggleDemoSpeech: () => void;
  onHeadpat: () => void;
  onSnapshot: () => void;
  onEnterObsMode: () => void;
  onToggleDrawer: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  webcamStatus,
  micStatus,
  mouseTracking,
  demoSpeech,
  drawerOpen,
  darkUi,
  telemetry,
  onToggleWebcam,
  onToggleMic,
  onToggleMouse,
  onToggleDemoSpeech,
  onHeadpat,
  onSnapshot,
  onEnterObsMode,
  onToggleDrawer,
}) => {
  const panelClass = darkUi
    ? 'glass-panel-dark text-slate-100'
    : 'glass-panel text-slate-800';

  const subtleText = darkUi ? 'text-slate-400' : 'text-slate-500';
  const idleBtn = darkUi
    ? 'text-slate-200 hover:bg-white/10 border-transparent'
    : 'text-slate-700 hover:bg-slate-900/6 border-transparent';

  const statusText =
    webcamStatus === 'active'
      ? telemetry.faceDetected
        ? 'Камера · лицо в кадре'
        : 'Камера · поиск лица…'
      : webcamStatus === 'loading'
        ? 'Загрузка трекинга…'
        : demoSpeech
          ? 'Демо-речь активна'
          : micStatus === 'active'
            ? 'Микрофон · липсинк'
            : mouseTracking
              ? 'Отслеживание курсора'
              : 'Свободный режим';

  const statusDotColor =
    webcamStatus === 'active'
      ? telemetry.faceDetected
        ? 'bg-emerald-500'
        : 'bg-amber-400 animate-pulse'
      : demoSpeech || micStatus === 'active'
        ? 'bg-sky-500'
        : 'bg-amber-400';

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-2 px-3 py-3 sm:px-4">
      {/* Left Brand + Status */}
      <div className={`pointer-events-auto flex items-center gap-2.5 rounded-2xl px-3 py-2 ${panelClass}`}>
        <div
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-inner"
          style={{ background: 'linear-gradient(145deg, #f7d23b 0%, #e5b20d 100%)' }}
        >
          {/* Mini stylized Baby Noob face emblem */}
          <svg viewBox="0 0 36 36" className="h-7 w-7" aria-hidden="true">
            <circle cx="11.5" cy="15.5" r="2.6" fill="#0f172a" />
            <circle cx="24.5" cy="15.5" r="2.6" fill="#0f172a" />
            <path
              d="M12.5 21.2 Q18 22.8 23.5 21.2 C23.5 26.8 21 29.2 18 29.2 C15 29.2 12.5 26.8 12.5 21.2 Z"
              fill="#d8244e"
              stroke="#0f172a"
              strokeWidth="1.9"
              strokeLinejoin="round"
            />
          </svg>
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 ${
              darkUi ? 'border-slate-900' : 'border-white'
            } ${statusDotColor}`}
          />
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-sm font-bold tracking-tight sm:text-[15px]">
              Baby Noob
            </span>
            <span className="rounded-md bg-[#0648a6] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              VTuber
            </span>
          </div>
          <div className={`flex items-center gap-2 text-[11px] font-medium ${subtleText}`}>
            <span>{statusText}</span>
            <span className="hidden font-mono-tech opacity-75 sm:inline">{telemetry.fps} FPS</span>
          </div>
        </div>
      </div>

      {/* Center Tracking Controls */}
      <nav
        aria-label="Источники трекинга"
        className={`pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5 ${panelClass}`}
      >
        <button
          type="button"
          onClick={onToggleWebcam}
          disabled={webcamStatus === 'loading'}
          title="Трекинг лица через веб-камеру (MediaPipe)"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${
            webcamStatus === 'active'
              ? 'border-emerald-500/40 bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
              : webcamStatus === 'loading'
                ? 'border-amber-400/40 bg-amber-400/20 text-amber-700'
                : idleBtn
          }`}
        >
          {webcamStatus === 'loading' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : webcamStatus === 'active' ? (
            <Video className="h-3.5 w-3.5" />
          ) : (
            <VideoOff className="h-3.5 w-3.5 opacity-80" />
          )}
          <span className="hidden md:inline">Камера</span>
        </button>

        <button
          type="button"
          onClick={onToggleMic}
          title="Липсинк по микрофону (реагирует на голос)"
          className={`relative flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${
            micStatus === 'active'
              ? 'border-rose-500/40 bg-rose-500 text-white shadow-sm shadow-rose-500/30'
              : idleBtn
          }`}
        >
          {micStatus === 'active' ? (
            <Mic className="h-3.5 w-3.5" />
          ) : (
            <MicOff className="h-3.5 w-3.5 opacity-80" />
          )}
          <span className="hidden md:inline">Микрофон</span>
          {micStatus === 'active' && telemetry.isTalking && (
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleMouse}
          title="Поворот головы и взгляда за курсором"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${
            mouseTracking && webcamStatus !== 'active' && !demoSpeech
              ? 'border-[#0648a6]/30 bg-[#0648a6] text-white shadow-sm shadow-[#0648a6]/25'
              : idleBtn
          }`}
        >
          <MousePointer2 className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Мышь</span>
        </button>

        <button
          type="button"
          onClick={onToggleDemoSpeech}
          title="Демонстрация речи и липсинка без микрофона"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${
            demoSpeech
              ? 'border-amber-500/40 bg-amber-500 text-slate-950 shadow-sm shadow-amber-500/30'
              : idleBtn
          }`}
        >
          <AudioLines className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Демо-речь</span>
        </button>
      </nav>

      {/* Right Quick Actions */}
      <div className={`pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5 ${panelClass}`}>
        <button
          type="button"
          onClick={onHeadpat}
          title="Погладить Baby Noob (или кликни по персонажу)"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
            darkUi
              ? 'text-pink-300 hover:bg-pink-500/20'
              : 'text-rose-600 hover:bg-rose-500/10'
          }`}
        >
          <Heart className="h-3.5 w-3.5 fill-current" />
          <span className="hidden xl:inline">Погладить</span>
        </button>

        <button
          type="button"
          onClick={onSnapshot}
          title="Скачать прозрачный PNG-стикер"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${idleBtn}`}
        >
          <Camera className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">PNG</span>
        </button>

        <a
          href="/models/baby_noob.glb"
          download="baby_noob_vtuber.glb"
          title="Скачать 3D-модель .GLB"
          className={`hidden cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all lg:flex ${idleBtn}`}
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">GLB</span>
        </a>

        <button
          type="button"
          onClick={onEnterObsMode}
          title="OBS режим — скрыть интерфейс (клавиша H)"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${idleBtn}`}
        >
          <EyeOff className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">OBS</span>
        </button>

        <button
          type="button"
          onClick={onToggleDrawer}
          title="Настройки студии"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
            drawerOpen
              ? 'bg-[#0648a6] text-white shadow-sm'
              : idleBtn
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Студия</span>
        </button>
      </div>
    </header>
  );
};
