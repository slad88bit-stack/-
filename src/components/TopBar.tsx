import React from 'react';
import {
  AudioLines,
  Camera,
  EyeOff,
  Heart,
  Loader2,
  Mic,
  MicOff,
  MousePointer2,
  Palette,
  Repeat2,
  SlidersHorizontal,
  Video,
  VideoOff,
} from 'lucide-react';
import {
  CHARACTERS,
  type CharacterId,
  type MicStatus,
  type RepeaterPhase,
  type TelemetrySnapshot,
  type WebcamStatus,
} from '../types/vtuber';

interface TopBarProps {
  characterId: CharacterId;
  switchingChar: boolean;
  webcamStatus: WebcamStatus;
  micStatus: MicStatus;
  repeaterPhase: RepeaterPhase;
  mouseTracking: boolean;
  demoSpeech: boolean;
  drawerOpen: boolean;
  isCustomizerActive: boolean;
  darkUi: boolean;
  telemetry: TelemetrySnapshot;
  onSelectCharacter: (id: CharacterId) => void;
  onToggleWebcam: () => void;
  onToggleMic: () => void;
  onToggleRepeater: () => void;
  onToggleMouse: () => void;
  onToggleDemoSpeech: () => void;
  onHeadpat: () => void;
  onSnapshot: () => void;
  onEnterObsMode: () => void;
  onOpenCustomizer: () => void;
  onToggleDrawer: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  characterId,
  switchingChar,
  webcamStatus,
  micStatus,
  repeaterPhase,
  mouseTracking,
  demoSpeech,
  drawerOpen,
  isCustomizerActive,
  darkUi,
  telemetry,
  onSelectCharacter,
  onToggleWebcam,
  onToggleMic,
  onToggleRepeater,
  onToggleMouse,
  onToggleDemoSpeech,
  onHeadpat,
  onSnapshot,
  onEnterObsMode,
  onOpenCustomizer,
  onToggleDrawer,
}) => {
  const panelClass = darkUi
    ? 'glass-panel-dark text-slate-100'
    : 'glass-panel text-slate-800';

  const subtleText = darkUi ? 'text-slate-400' : 'text-slate-500';
  const idleBtn = darkUi
    ? 'text-slate-200 hover:bg-white/10 border-transparent'
    : 'text-slate-700 hover:bg-slate-900/6 border-transparent';

  const armsTracked = telemetry.armLDetected || telemetry.armRDetected;
  const repeaterActive =
    repeaterPhase === 'listening' || repeaterPhase === 'recording' || repeaterPhase === 'speaking';
  const statusText =
    repeaterPhase === 'recording'
      ? 'Слушаю фразу…'
      : repeaterPhase === 'speaking'
        ? 'Повторяю!'
        : webcamStatus === 'active'
          ? telemetry.faceDetected && armsTracked
            ? 'Лицо + руки'
            : telemetry.faceDetected
              ? 'Камера · лицо'
              : armsTracked
                ? 'Камера · руки'
                : 'Камера · поиск…'
          : webcamStatus === 'loading'
            ? 'Загрузка…'
            : repeaterPhase === 'listening'
              ? 'Повторяшка'
              : demoSpeech
                ? 'Демо-речь'
                : micStatus === 'active'
                  ? 'Микрофон'
                  : mouseTracking
                    ? 'Курсор'
                    : 'Свободный';

  const statusDotColor =
    repeaterPhase === 'recording'
      ? 'bg-rose-500 animate-ping'
      : repeaterPhase === 'speaking'
        ? 'bg-fuchsia-500 animate-pulse'
        : webcamStatus === 'active'
          ? telemetry.faceDetected || armsTracked
            ? 'bg-emerald-500'
            : 'bg-amber-400 animate-pulse'
          : repeaterPhase === 'listening' || demoSpeech || micStatus === 'active'
            ? 'bg-sky-500'
            : 'bg-amber-400';

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:flex-nowrap sm:px-4">
      {/* Left Brand + 3-Character Quick Roster Switcher */}
      <div className={`pointer-events-auto flex items-center gap-2 rounded-2xl p-1.5 pl-2.5 ${panelClass}`}>
        <div className="hidden items-center gap-2 pr-1 lg:flex">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-amber-500 shadow-inner">
            <svg viewBox="0 0 36 36" className="h-6 w-6" aria-hidden="true">
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
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${
                darkUi ? 'border-slate-900' : 'border-white'
              } ${statusDotColor}`}
            />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1">
              <span className="font-display text-xs font-bold tracking-tight">VTuber</span>
              <span className="font-mono-tech text-[10px] opacity-60">{telemetry.fps}</span>
            </div>
            <div className={`text-[10px] font-medium ${subtleText}`}>{statusText}</div>
          </div>
        </div>

        {/* Character Roster Pills */}
        <div
          className={`flex items-center gap-1 rounded-xl p-0.5 ${darkUi ? 'bg-white/6' : 'bg-slate-900/5'}`}
          role="group"
          aria-label="Выбор персонажа"
        >
          {CHARACTERS.map((ch) => {
            const active = characterId === ch.id;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectCharacter(ch.id)}
                title={`${ch.name} — ${ch.subtitle}`}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all ${
                  active
                    ? 'bg-[#0648a6] text-white shadow-sm'
                    : darkUi
                      ? 'text-slate-300 hover:bg-white/10 hover:text-white'
                      : 'text-slate-700 hover:bg-white/80 hover:text-slate-950'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/15"
                  style={{ backgroundColor: ch.badgeColor }}
                />
                <span>{ch.shortName}</span>
                {active && switchingChar && <Loader2 className="h-3 w-3 animate-spin" />}
              </button>
            );
          })}
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
          title="Трекинг лица, рта и рук через веб-камеру (MediaPipe)"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all ${
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
          title="Липсинк по микрофону"
          className={`relative flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all ${
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
          onClick={onToggleRepeater}
          title="Повторяшка: слушает твою фразу и повторяет голосом малыша (клавиша R)"
          className={`relative flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all ${
            repeaterPhase === 'recording'
              ? 'border-rose-500/50 bg-rose-500 text-white shadow-sm shadow-rose-500/35'
              : repeaterPhase === 'speaking'
                ? 'border-fuchsia-500/50 bg-gradient-to-r from-pink-500 to-violet-500 text-white shadow-sm shadow-fuchsia-500/35'
                : repeaterActive
                  ? 'border-violet-500/45 bg-violet-500 text-white shadow-sm shadow-violet-500/30'
                  : darkUi
                    ? 'border-violet-400/25 bg-violet-500/18 text-violet-200 hover:bg-violet-500/30'
                    : 'border-violet-500/20 bg-violet-500/12 text-violet-900 hover:bg-violet-500/22'
          }`}
        >
          <Repeat2 className={`h-3.5 w-3.5 ${repeaterPhase === 'speaking' ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">
            {repeaterPhase === 'recording'
              ? 'Запись…'
              : repeaterPhase === 'speaking'
                ? 'Повторяю!'
                : repeaterPhase === 'listening'
                  ? 'Слушаю…'
                  : 'Повторяшка'}
          </span>
          {repeaterPhase === 'recording' && (
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-white" />
          )}
        </button>

        <button
          type="button"
          onClick={onToggleMouse}
          title="Поворот головы и взгляда за курсором"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all ${
            mouseTracking && webcamStatus !== 'active' && !demoSpeech
              ? 'border-[#0648a6]/30 bg-[#0648a6] text-white shadow-sm'
              : idleBtn
          }`}
        >
          <MousePointer2 className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Мышь</span>
        </button>

        <button
          type="button"
          onClick={onToggleDemoSpeech}
          title="Демонстрация речи и липсинка"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition-all ${
            demoSpeech
              ? 'border-amber-500/40 bg-amber-500 text-slate-950 shadow-sm'
              : idleBtn
          }`}
        >
          <AudioLines className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">Демо</span>
        </button>
      </nav>

      {/* Right Quick Actions + Prominent Кастомка Button */}
      <div className={`pointer-events-auto flex items-center gap-1 rounded-2xl p-1.5 ${panelClass}`}>
        <button
          type="button"
          onClick={onOpenCustomizer}
          title="Кастомка персонажа — цвета, кепка, лицо, аксессуары (клавиша C)"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
            isCustomizerActive
              ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 shadow-sm'
              : darkUi
                ? 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/30'
                : 'bg-amber-400/25 text-amber-950 hover:bg-amber-400/40'
          }`}
        >
          <Palette className="h-3.5 w-3.5" />
          <span>Кастомка</span>
        </button>

        <button
          type="button"
          onClick={onHeadpat}
          title="Погладить персонажа (Space)"
          className={`flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition-all ${
            darkUi ? 'text-pink-300 hover:bg-pink-500/20' : 'text-rose-600 hover:bg-rose-500/10'
          }`}
        >
          <Heart className="h-3.5 w-3.5 fill-current" />
        </button>

        <button
          type="button"
          onClick={onSnapshot}
          title="Скачать прозрачный PNG-стикер"
          className={`flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition-all ${idleBtn}`}
        >
          <Camera className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={onEnterObsMode}
          title="OBS режим — скрыть интерфейс (H)"
          className={`flex cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-semibold transition-all ${idleBtn}`}
        >
          <EyeOff className="h-3.5 w-3.5" />
          <span className="hidden xl:inline">OBS</span>
        </button>

        <button
          type="button"
          onClick={onToggleDrawer}
          title="Открыть / скрыть панель студии"
          className={`flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-all ${
            drawerOpen && !isCustomizerActive ? 'bg-[#0648a6] text-white shadow-sm' : idleBtn
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Студия</span>
        </button>
      </div>
    </header>
  );
};
