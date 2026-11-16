import React, { useEffect, useRef } from 'react';
import {
  Camera,
  Crosshair,
  Download,
  Image as ImageIcon,
  Layers,
  Sliders,
  Sparkles,
  Sun,
  Video,
  X,
} from 'lucide-react';
import {
  BACKGROUNDS,
  type AccessoriesState,
  type BackgroundId,
  type CameraPresetId,
  type LightingPresetId,
  type TelemetrySnapshot,
  type TrackingSettings,
  type WebcamStatus,
} from '../types/vtuber';

export type DrawerTab = 'tracking' | 'stage' | 'style';

interface StudioDrawerProps {
  open: boolean;
  tab: DrawerTab;
  darkUi: boolean;
  webcamStatus: WebcamStatus;
  webcamError: string | null;
  micError: string | null;
  telemetry: TelemetrySnapshot;
  settings: TrackingSettings;
  background: BackgroundId;
  cameraPreset: CameraPresetId;
  lighting: LightingPresetId;
  accessories: AccessoriesState;
  onChangeTab: (tab: DrawerTab) => void;
  onClose: () => void;
  onAttachPreviewCanvas: (canvas: HTMLCanvasElement | null) => void;
  onCalibrateWebcam: () => void;
  onToggleWebcam: () => void;
  onUpdateSettings: (patch: Partial<TrackingSettings>) => void;
  onSelectBackground: (bg: BackgroundId) => void;
  onSelectCameraPreset: (preset: CameraPresetId) => void;
  onSelectLighting: (light: LightingPresetId) => void;
  onUpdateAccessories: (patch: Partial<AccessoriesState>) => void;
  onSnapshot: () => void;
}

const CAMERA_OPTIONS: Array<{ id: CameraPresetId; label: string }> = [
  { id: 'portrait', label: 'Портрет (VTuber)' },
  { id: 'fullbody', label: 'В полный рост' },
  { id: 'closeup', label: 'Крупный план' },
  { id: 'free', label: 'Свободная' },
];

const LIGHTING_OPTIONS: Array<{ id: LightingPresetId; label: string }> = [
  { id: 'daylight', label: 'Дневной' },
  { id: 'studio', label: 'Студия' },
  { id: 'sunset', label: 'Закат' },
  { id: 'stream', label: 'Стрим' },
];

const ACCESSORY_LIST: Array<{
  key: keyof AccessoriesState;
  label: string;
  desc: string;
  emoji: string;
}> = [
  { key: 'headphones', label: 'Наушники стримера', desc: 'Гарнитура с LED-кольцом и микрофоном', emoji: '🎧' },
  { key: 'crown', label: 'Золотая корона', desc: 'Корона с самоцветами на голове', emoji: '👑' },
  { key: 'sunglasses', label: 'Очки стримера', desc: 'Стильные тёмные очки с бликом', emoji: '🕶️' },
  { key: 'halo', label: 'Светящийся нимб', desc: 'Парящее золотое кольцо сверху', emoji: '😇' },
  { key: 'blushAlways', label: 'Постоянный румянец', desc: 'Милые розовые щёчки всегда', emoji: '🌸' },
];

export const StudioDrawer: React.FC<StudioDrawerProps> = ({
  open,
  tab,
  darkUi,
  webcamStatus,
  webcamError,
  micError,
  telemetry,
  settings,
  background,
  cameraPreset,
  lighting,
  accessories,
  onChangeTab,
  onClose,
  onAttachPreviewCanvas,
  onCalibrateWebcam,
  onToggleWebcam,
  onUpdateSettings,
  onSelectBackground,
  onSelectCameraPreset,
  onSelectLighting,
  onUpdateAccessories,
  onSnapshot,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (open && tab === 'tracking') {
      onAttachPreviewCanvas(previewCanvasRef.current);
    } else {
      onAttachPreviewCanvas(null);
    }
    return () => onAttachPreviewCanvas(null);
  }, [open, tab, onAttachPreviewCanvas]);

  if (!open) return null;

  const panelClass = darkUi
    ? 'glass-panel-dark text-slate-100'
    : 'glass-panel text-slate-800';
  const cardBg = darkUi ? 'bg-white/6 border-white/10' : 'bg-slate-900/[0.035] border-slate-900/8';
  const muted = darkUi ? 'text-slate-400' : 'text-slate-500';

  return (
    <aside
      aria-label="Панель настроек VTuber Studio"
      className={`fixed right-3 top-[74px] bottom-[84px] z-30 flex w-[312px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl ${panelClass}`}
    >
      {/* Drawer Header & Tabs */}
      <div className={`flex items-center justify-between border-b px-3.5 py-2.5 ${darkUi ? 'border-white/10' : 'border-slate-900/8'}`}>
        <div className="flex items-center gap-1 rounded-xl bg-black/5 p-1">
          {(
            [
              { id: 'tracking', label: 'Трекинг', icon: Sliders },
              { id: 'stage', label: 'Сцена', icon: Layers },
              { id: 'style', label: 'Образ', icon: Sparkles },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeTab(item.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                  active
                    ? 'bg-[#0648a6] text-white shadow-sm'
                    : darkUi
                      ? 'text-slate-300 hover:text-white'
                      : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть панель"
          className={`cursor-pointer rounded-lg p-1.5 transition-colors ${
            darkUi ? 'text-slate-400 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-slate-900/8 hover:text-slate-900'
          }`}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Tab Content */}
      <div className="studio-scroll flex-1 space-y-3.5 overflow-y-auto p-3.5">
        {tab === 'tracking' && (
          <>
            {/* Error Alerts */}
            {(webcamError || micError) && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
                {webcamError || micError}
              </div>
            )}

            {/* Webcam Face-Mesh PiP Preview */}
            <div className={`overflow-hidden rounded-xl border ${cardBg}`}>
              <div className="relative aspect-[4/3] w-full bg-slate-950/90">
                <canvas
                  ref={previewCanvasRef}
                  width={320}
                  height={240}
                  className="h-full w-full object-cover"
                />
                {webcamStatus !== 'active' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-slate-300">
                    <Video className="h-7 w-7 opacity-60" />
                    <p className="text-xs leading-snug text-slate-300/90">
                      Включи камеру для 3D-трекинга лица, моргания и мимики в реальном времени
                    </p>
                    <button
                      type="button"
                      onClick={onToggleWebcam}
                      className="mt-1 cursor-pointer rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600"
                    >
                      Запустить камеру
                    </button>
                  </div>
                )}
                {webcamStatus === 'active' && (
                  <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md ${
                        telemetry.faceDetected
                          ? 'bg-emerald-500/85 text-white'
                          : 'bg-amber-500/85 text-slate-950'
                      }`}
                    >
                      {telemetry.faceDetected ? 'Лицо найдено' : 'Посмотри в камеру…'}
                    </span>
                    <button
                      type="button"
                      onClick={onCalibrateWebcam}
                      className="flex cursor-pointer items-center gap-1 rounded-md bg-slate-900/75 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md hover:bg-slate-900"
                    >
                      <Crosshair className="h-3 w-3" />
                      Центр
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Live Telemetry & Voice Spectrum */}
            <div className={`space-y-2.5 rounded-xl border p-3 ${cardBg}`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">
                  Телеметрия рига
                </span>
                <span className={`font-mono-tech text-[11px] ${muted}`}>
                  Y:{telemetry.yawDeg}° P:{telemetry.pitchDeg}° R:{telemetry.rollDeg}°
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <MeterBar label="Глаз L" value={1 - telemetry.blinkL} color="bg-amber-400" darkUi={darkUi} />
                <MeterBar label="Глаз R" value={1 - telemetry.blinkR} color="bg-amber-400" darkUi={darkUi} />
                <MeterBar label="Рот" value={telemetry.mouthOpen} color="bg-rose-500" darkUi={darkUi} />
              </div>

              {/* Live 16-bar Voice Spectrum */}
              <div>
                <div className="mb-1 flex items-center justify-between text-[10px]">
                  <span className={muted}>Спектр голоса / липсинк</span>
                  <span className={`font-mono-tech ${telemetry.isTalking ? 'font-bold text-emerald-500' : muted}`}>
                    {telemetry.isTalking ? 'ГОВОРИТ' : 'ТИШИНА'}
                  </span>
                </div>
                <div className="flex h-8 items-end gap-[3px] rounded-lg bg-black/5 px-2 py-1.5">
                  {telemetry.spectrum.map((v, idx) => (
                    <div
                      key={idx}
                      className="flex-1 rounded-full transition-[height] duration-75"
                      style={{
                        height: `${Math.max(12, Math.round(v * 100))}%`,
                        background:
                          v > 0.55
                            ? '#f43f5e'
                            : v > 0.25
                              ? '#f59e0b'
                              : '#0648a6',
                        opacity: Math.max(0.25, v + 0.2),
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Sliders */}
            <div className={`space-y-3 rounded-xl border p-3 ${cardBg}`}>
              <SliderRow
                label="Чувствительность головы"
                value={settings.headSensitivity}
                min={0.3}
                max={2.0}
                step={0.05}
                display={`${Math.round(settings.headSensitivity * 100)}%`}
                onChange={(v) => onUpdateSettings({ headSensitivity: v })}
              />
              <SliderRow
                label="Наклон корпуса"
                value={settings.bodySway}
                min={0}
                max={1.5}
                step={0.05}
                display={`${Math.round(settings.bodySway * 100)}%`}
                onChange={(v) => onUpdateSettings({ bodySway: v })}
              />
              <SliderRow
                label="Плавность движений"
                value={settings.smoothing}
                min={0.1}
                max={0.92}
                step={0.02}
                display={`${Math.round(settings.smoothing * 100)}%`}
                onChange={(v) => onUpdateSettings({ smoothing: v })}
              />
              <SliderRow
                label="Пружинность / физика"
                value={settings.bouncePhysics}
                min={0}
                max={1.6}
                step={0.05}
                display={`${Math.round(settings.bouncePhysics * 100)}%`}
                onChange={(v) => onUpdateSettings({ bouncePhysics: v })}
              />
              <SliderRow
                label="Усиление микрофона"
                value={settings.micGain}
                min={0.5}
                max={3.0}
                step={0.05}
                display={`${settings.micGain.toFixed(1)}×`}
                onChange={(v) => onUpdateSettings({ micGain: v })}
              />
            </div>

            {/* Boolean Toggles */}
            <div className={`space-y-2 rounded-xl border p-3 ${cardBg}`}>
              <ToggleRow
                label="Авто-моргание"
                checked={settings.autoBlink}
                onChange={(v) => onUpdateSettings({ autoBlink: v })}
              />
              <ToggleRow
                label="Движение глаз за взглядом"
                checked={settings.eyeTracking}
                onChange={(v) => onUpdateSettings({ eyeTracking: v })}
              />
              <ToggleRow
                label="Зеркалить камеру (селфи)"
                checked={settings.mirrorCamera}
                onChange={(v) => onUpdateSettings({ mirrorCamera: v })}
              />
              <ToggleRow
                label="Поглаживание по клику"
                checked={settings.headpatEnabled}
                onChange={(v) => onUpdateSettings({ headpatEnabled: v })}
              />
            </div>
          </>
        )}

        {tab === 'stage' && (
          <>
            {/* Backgrounds & Chroma Key */}
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-70">
                <ImageIcon className="h-3.5 w-3.5" />
                Фон и хромакей OBS
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BACKGROUNDS.map((bg) => {
                  const active = background === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => onSelectBackground(bg.id)}
                      className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-all ${
                        active
                          ? 'border-[#0648a6] ring-2 ring-[#0648a6]/35'
                          : darkUi
                            ? 'border-white/10 hover:border-white/25'
                            : 'border-slate-900/10 hover:border-slate-900/25'
                      }`}
                    >
                      <div className="h-10 w-full" style={{ background: bg.swatch }} />
                      <div className={`px-2.5 py-1.5 ${darkUi ? 'bg-white/5' : 'bg-white/75'}`}>
                        <div className="text-[11px] font-bold leading-tight">{bg.label}</div>
                        <div className={`mt-0.5 text-[10px] leading-tight ${muted}`}>{bg.description}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Camera Framing Presets */}
            <div className={`space-y-2 rounded-xl border p-3 ${cardBg}`}>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-70">
                <Camera className="h-3.5 w-3.5" />
                Кадр камеры
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {CAMERA_OPTIONS.map((cam) => {
                  const active = cameraPreset === cam.id;
                  return (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => onSelectCameraPreset(cam.id)}
                      className={`cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-[#0648a6] text-white shadow-sm'
                          : darkUi
                            ? 'bg-white/6 text-slate-200 hover:bg-white/12'
                            : 'bg-white/75 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {cam.label}
                    </button>
                  );
                })}
              </div>
              <p className={`text-[11px] leading-snug ${muted}`}>
                Подсказка: тяни мышкой по сцене, чтобы вращать камеру, и крути колесо для приближения.
              </p>
            </div>

            {/* Lighting Mood */}
            <div className={`space-y-2 rounded-xl border p-3 ${cardBg}`}>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-70">
                <Sun className="h-3.5 w-3.5" />
                Освещение
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {LIGHTING_OPTIONS.map((lt) => {
                  const active = lighting === lt.id;
                  return (
                    <button
                      key={lt.id}
                      type="button"
                      onClick={() => onSelectLighting(lt.id)}
                      className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-amber-400 text-slate-950 shadow-sm'
                          : darkUi
                            ? 'bg-white/6 text-slate-200 hover:bg-white/12'
                            : 'bg-white/75 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {lt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* OBS Quick Guide */}
            <div className="rounded-xl border border-[#0648a6]/25 bg-[#0648a6]/10 p-3 text-xs leading-relaxed">
              <div className="font-bold text-[#0648a6] dark:text-sky-300">Захват в OBS Studio</div>
              <p className="mt-1 opacity-85">
                Выбери <strong>Хромакей Зелёный</strong>, нажми <strong>OBS</strong> (или клавишу{' '}
                <kbd className="rounded bg-black/15 px-1 py-0.5 font-mono-tech text-[10px]">H</kbd>) —
                весь интерфейс скроется для чистого захвата окна или Browser Source.
              </p>
            </div>
          </>
        )}

        {tab === 'style' && (
          <>
            {/* 3D VTuber Accessories */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">
                3D-аксессуары на риге
              </div>
              {ACCESSORY_LIST.map((acc) => {
                const active = accessories[acc.key];
                return (
                  <button
                    key={acc.key}
                    type="button"
                    onClick={() => onUpdateAccessories({ [acc.key]: !active })}
                    className={`flex w-full cursor-pointer items-center justify-between gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                      active
                        ? 'border-[#0648a6] bg-[#0648a6]/12 shadow-sm'
                        : `${cardBg} hover:border-slate-400/40`
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80 text-lg shadow-xs">
                        {acc.emoji}
                      </span>
                      <div>
                        <div className="text-xs font-bold">{acc.label}</div>
                        <div className={`text-[10px] leading-tight ${muted}`}>{acc.desc}</div>
                      </div>
                    </div>
                    <div
                      className={`h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${
                        active ? 'bg-[#0648a6]' : 'bg-slate-400/35'
                      }`}
                    >
                      <div
                        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          active ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Export & Character Info */}
            <div className={`space-y-2.5 rounded-xl border p-3 ${cardBg}`}>
              <div className="text-xs font-bold uppercase tracking-wider opacity-70">
                Модель из Blender
              </div>
              <div className={`space-y-1 text-[11px] ${muted}`}>
                <div className="flex justify-between">
                  <span>Источник:</span>
                  <span className="font-mono-tech font-semibold text-current">baby_noob_animated.blend</span>
                </div>
                <div className="flex justify-between">
                  <span>Скелет:</span>
                  <span className="font-semibold text-current">BabyNoob_Rig · 8 костей</span>
                </div>
                <div className="flex justify-between">
                  <span>Анимации:</span>
                  <span className="font-semibold text-current">5 оригинальных клипов</span>
                </div>
                <div className="flex justify-between">
                  <span>Мимика:</span>
                  <span className="font-semibold text-current">1024px Live Canvas Face</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={onSnapshot}
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-300"
                >
                  <Camera className="h-3.5 w-3.5" />
                  Стикер PNG
                </button>
                <a
                  href="/models/baby_noob.glb"
                  download="baby_noob_vtuber.glb"
                  className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#0648a6] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#053b88]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Скачать GLB
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};

const MeterBar: React.FC<{ label: string; value: number; color: string; darkUi: boolean }> = ({
  label,
  value,
  color,
  darkUi,
}) => (
  <div>
    <div className="mb-1 flex justify-between text-[10px] font-medium opacity-75">
      <span>{label}</span>
      <span className="font-mono-tech">{Math.round(Math.max(0, Math.min(1, value)) * 100)}%</span>
    </div>
    <div className={`h-1.5 overflow-hidden rounded-full ${darkUi ? 'bg-white/10' : 'bg-slate-900/10'}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${color}`}
        style={{ width: `${Math.max(4, Math.min(100, value * 100))}%` }}
      />
    </div>
  </div>
);

const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, display, onChange }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="font-medium opacity-85">{label}</span>
      <span className="font-mono-tech text-[11px] font-semibold opacity-75">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="studio-slider w-full"
    />
  </div>
);

const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <label className="flex cursor-pointer items-center justify-between py-0.5 text-xs">
    <span className="font-medium opacity-85">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`h-5 w-9 cursor-pointer rounded-full p-0.5 transition-colors ${
        checked ? 'bg-[#0648a6]' : 'bg-slate-400/35'
      }`}
    >
      <div
        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  </label>
);
