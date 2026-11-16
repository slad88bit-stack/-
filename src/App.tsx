import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2, Sparkles } from 'lucide-react';
import {
  BACKGROUNDS,
  DEFAULT_ACCESSORIES,
  DEFAULT_TRACKING_SETTINGS,
  EMOTIONS,
  type AccessoriesState,
  type AnimationId,
  type BackgroundId,
  type CameraPresetId,
  type EmotionId,
  type LightingPresetId,
  type MicStatus,
  type TelemetrySnapshot,
  type TrackingSettings,
  type WebcamStatus,
} from './types/vtuber';
import { VTuberStage } from './vtuber/VTuberStage';
import { TopBar } from './components/TopBar';
import { BottomDock } from './components/BottomDock';
import { StudioDrawer, type DrawerTab } from './components/StudioDrawer';

const INITIAL_TELEMETRY: TelemetrySnapshot = {
  yawDeg: 0,
  pitchDeg: 0,
  rollDeg: 0,
  blinkL: 0,
  blinkR: 0,
  mouthOpen: 0,
  audioLevel: 0,
  isTalking: false,
  faceDetected: false,
  fps: 60,
  spectrum: new Array<number>(16).fill(0),
};

export const App: React.FC = () => {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<VTuberStage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [emotion, setEmotion] = useState<EmotionId>('happy');
  const [animationMode, setAnimationMode] = useState<AnimationId>('live');
  const [background, setBackground] = useState<BackgroundId>('studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('portrait');
  const [lighting, setLighting] = useState<LightingPresetId>('daylight');
  const [accessories, setAccessories] = useState<AccessoriesState>(DEFAULT_ACCESSORIES);
  const [settings, setSettings] = useState<TrackingSettings>(DEFAULT_TRACKING_SETTINGS);

  const [webcamStatus, setWebcamStatus] = useState<WebcamStatus>('idle');
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [mouseTracking, setMouseTracking] = useState(true);
  const [demoSpeech, setDemoSpeech] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('tracking');
  const [obsMode, setObsMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);

  const darkUi = useMemo(() => {
    return Boolean(BACKGROUNDS.find((b) => b.id === background)?.isDarkUi);
  }, [background]);

  const showToast = useCallback((message: string, durationMs = 2600) => {
    setToast(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
    }, durationMs);
  }, []);

  // Initialize Three.js VTuber Stage once
  useEffect(() => {
    const container = stageContainerRef.current;
    if (!container) return;

    const stage = new VTuberStage(container, {
      onLoaded: () => setLoading(false),
      onError: (msg) => {
        setLoading(false);
        setLoadError(msg);
      },
      onAnimationChange: (anim) => setAnimationMode(anim),
      onTelemetry: (snap) => setTelemetry(snap),
    });
    stageRef.current = stage;

    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  // Sync UI state -> VTuberStage
  useEffect(() => {
    stageRef.current?.setEmotion(emotion);
  }, [emotion]);

  useEffect(() => {
    stageRef.current?.setAnimationMode(animationMode);
  }, [animationMode]);

  useEffect(() => {
    stageRef.current?.setBackground(background);
  }, [background]);

  useEffect(() => {
    stageRef.current?.setLighting(lighting);
  }, [lighting]);

  useEffect(() => {
    stageRef.current?.setAccessories(accessories);
  }, [accessories]);

  useEffect(() => {
    stageRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    stageRef.current?.setDemoSpeech(demoSpeech);
  }, [demoSpeech]);

  useEffect(() => {
    stageRef.current?.setMouseTracking(mouseTracking);
  }, [mouseTracking]);

  // Global keyboard shortcuts (1-8 emotions, H OBS mode, Escape restore, Space headpat)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();

      if (key >= '1' && key <= '8') {
        const idx = parseInt(key, 10) - 1;
        const em = EMOTIONS[idx];
        if (em) {
          setEmotion(em.id);
        }
        return;
      }

      if (key === 'h' || key === 'р') {
        setObsMode((prev) => {
          const next = !prev;
          if (next) {
            showToast('OBS режим активен · нажми H или Esc, чтобы вернуть интерфейс', 3000);
          }
          return next;
        });
        return;
      }

      if (key === 'escape') {
        setObsMode(false);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        stageRef.current?.triggerHeadpat();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showToast]);

  const handleToggleWebcam = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;

    if (webcamStatus === 'active') {
      stage.webcam.stop();
      setWebcamStatus('idle');
      setWebcamError(null);
      showToast('Веб-камера отключена');
      return;
    }

    setWebcamStatus('loading');
    setWebcamError(null);
    setDrawerTab('tracking');
    setDrawerOpen(true);

    try {
      await stage.webcam.start();
      setWebcamStatus('active');
      setDemoSpeech(false);
      setAnimationMode('live');
      showToast('Трекинг лица запущен! Поверни голову или моргни');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Нет доступа к веб-камере. Проверь разрешения браузера.';
      setWebcamStatus('error');
      setWebcamError(msg);
      showToast('Не удалось включить камеру', 3200);
    }
  }, [webcamStatus, showToast]);

  const handleToggleMic = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;

    if (micStatus === 'active') {
      stage.audio.stop();
      setMicStatus('idle');
      setMicError(null);
      showToast('Микрофон отключён');
      return;
    }

    setMicError(null);
    try {
      await stage.audio.start();
      setMicStatus('active');
      setDemoSpeech(false);
      showToast('Микрофон активен — говори, Baby Noob повторяет губами!');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Нет доступа к микрофону. Проверь разрешения браузера.';
      setMicStatus('error');
      setMicError(msg);
      setDrawerTab('tracking');
      setDrawerOpen(true);
      showToast('Не удалось включить микрофон', 3200);
    }
  }, [micStatus, showToast]);

  const handleToggleMouse = useCallback(() => {
    setMouseTracking((prev) => {
      const next = !prev;
      if (next) {
        setDemoSpeech(false);
        setAnimationMode('live');
      }
      return next;
    });
  }, []);

  const handleToggleDemoSpeech = useCallback(() => {
    setDemoSpeech((prev) => {
      const next = !prev;
      if (next) {
        setAnimationMode('live');
        showToast('Демо-речь включена — смотри на липсинк и жесты!');
      }
      return next;
    });
  }, [showToast]);

  const handleCameraPreset = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    stageRef.current?.setCameraPreset(preset);
  }, []);

  const handleHeadpat = useCallback(() => {
    stageRef.current?.triggerHeadpat();
  }, []);

  const handleSnapshot = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const pngUrl = stage.captureTransparentPNG();
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `baby-noob-vtuber-${emotion}.png`;
    link.click();
    showToast('Прозрачный PNG-стикер сохранён!');
  }, [emotion, showToast]);

  const handleAttachPreviewCanvas = useCallback((canvas: HTMLCanvasElement | null) => {
    stageRef.current?.webcam.setPreviewCanvas(canvas);
  }, []);

  const handleCalibrateWebcam = useCallback(() => {
    stageRef.current?.webcam.calibrate();
    showToast('Центральная поза откалибрована');
  }, [showToast]);

  const handleUpdateSettings = useCallback((patch: Partial<TrackingSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateAccessories = useCallback((patch: Partial<AccessoriesState>) => {
    setAccessories((prev) => ({ ...prev, ...patch }));
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* 100% Full-Viewport 3D VTuber Canvas */}
      <div
        ref={stageContainerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f4f1ea]/95 backdrop-blur-md">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/85 px-8 py-6 shadow-xl">
            <Loader2 className="h-9 w-9 animate-spin text-[#0648a6]" />
            <div className="font-display text-lg font-bold text-slate-900">
              Загружаем Baby Noob VTuber…
            </div>
            <p className="text-xs text-slate-500">
              Подготавливаем скелет BabyNoob_Rig, 5 анимаций и живую мимику
            </p>
          </div>
        </div>
      )}

      {/* Load Error Overlay */}
      {loadError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h2 className="font-display text-lg font-bold text-rose-600">Ошибка загрузки 3D-модели</h2>
            <p className="mt-2 text-sm text-slate-600">{loadError}</p>
          </div>
        </div>
      )}

      {/* Main Studio UI (hidden cleanly in OBS mode) */}
      {!obsMode && !loading && !loadError && (
        <>
          <TopBar
            webcamStatus={webcamStatus}
            micStatus={micStatus}
            mouseTracking={mouseTracking}
            demoSpeech={demoSpeech}
            drawerOpen={drawerOpen}
            darkUi={darkUi}
            telemetry={telemetry}
            onToggleWebcam={() => void handleToggleWebcam()}
            onToggleMic={() => void handleToggleMic()}
            onToggleMouse={handleToggleMouse}
            onToggleDemoSpeech={handleToggleDemoSpeech}
            onHeadpat={handleHeadpat}
            onSnapshot={handleSnapshot}
            onEnterObsMode={() => {
              setObsMode(true);
              showToast('OBS режим активен · нажми H или Esc, чтобы вернуть интерфейс', 3000);
            }}
            onToggleDrawer={() => setDrawerOpen((v) => !v)}
          />

          <StudioDrawer
            open={drawerOpen}
            tab={drawerTab}
            darkUi={darkUi}
            webcamStatus={webcamStatus}
            webcamError={webcamError}
            micError={micError}
            telemetry={telemetry}
            settings={settings}
            background={background}
            cameraPreset={cameraPreset}
            lighting={lighting}
            accessories={accessories}
            onChangeTab={setDrawerTab}
            onClose={() => setDrawerOpen(false)}
            onAttachPreviewCanvas={handleAttachPreviewCanvas}
            onCalibrateWebcam={handleCalibrateWebcam}
            onToggleWebcam={() => void handleToggleWebcam()}
            onUpdateSettings={handleUpdateSettings}
            onSelectBackground={setBackground}
            onSelectCameraPreset={handleCameraPreset}
            onSelectLighting={setLighting}
            onUpdateAccessories={handleUpdateAccessories}
            onSnapshot={handleSnapshot}
          />

          <BottomDock
            emotion={emotion}
            animationMode={animationMode}
            darkUi={darkUi}
            onSelectEmotion={setEmotion}
            onSelectAnimation={setAnimationMode}
          />

          {/* Subtle keyboard/interaction hint on bottom-left desktop */}
          <div
            className={`pointer-events-none fixed bottom-4 left-4 z-20 hidden items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium xl:flex ${
              darkUi
                ? 'bg-slate-900/50 text-slate-300 backdrop-blur-md'
                : 'bg-white/60 text-slate-600 backdrop-blur-md'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>Клик — погладить · 1–8 эмоции · H — OBS</span>
          </div>
        </>
      )}

      {/* Discrete restore button in OBS mode (nearly invisible until hovered) */}
      {obsMode && (
        <button
          type="button"
          onClick={() => setObsMode(false)}
          className="fixed bottom-3 right-3 z-40 flex cursor-pointer items-center gap-1.5 rounded-xl bg-slate-900/75 px-3 py-2 text-xs font-semibold text-white opacity-15 backdrop-blur-md transition-opacity hover:opacity-100"
        >
          <Eye className="h-3.5 w-3.5" />
          Выйти из OBS (H)
        </button>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="pointer-events-none fixed left-1/2 top-[76px] z-40 -translate-x-1/2">
          <div className="rounded-2xl bg-slate-900/88 px-4 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur-md">
            {toast}
          </div>
        </div>
      )}
    </main>
  );
};

export default App;
