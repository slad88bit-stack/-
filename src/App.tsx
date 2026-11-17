import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Loader2, Sparkles } from 'lucide-react';
import {
  BACKGROUNDS,
  CHARACTERS,
  CUSTOM_PRESETS,
  DEFAULT_ACCESSORIES,
  DEFAULT_TRACKING_SETTINGS,
  EMOTIONS,
  getCharacterMeta,
  type AccessoriesState,
  type AnimationId,
  type BackgroundId,
  type CameraPresetId,
  type CharacterCustomization,
  type CharacterId,
  type EmotionId,
  type FaceStyleId,
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

const STORAGE_KEY = 'baby_vtuber_custom_v2';

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

interface SavedRosterState {
  customByChar: Record<CharacterId, CharacterCustomization>;
  accByChar: Record<CharacterId, AccessoriesState>;
}

function createDefaultRosterState(): SavedRosterState {
  return {
    customByChar: {
      noob: { ...getCharacterMeta('noob').defaultCustomization },
      guest: { ...getCharacterMeta('guest').defaultCustomization },
      modern_guest: { ...getCharacterMeta('modern_guest').defaultCustomization },
    },
    accByChar: {
      noob: { ...DEFAULT_ACCESSORIES },
      guest: { ...DEFAULT_ACCESSORIES },
      modern_guest: { ...DEFAULT_ACCESSORIES },
    },
  };
}

function loadSavedRosterState(): SavedRosterState {
  const base = createDefaultRosterState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<SavedRosterState>;
    for (const ch of CHARACTERS) {
      if (parsed.customByChar?.[ch.id]) {
        base.customByChar[ch.id] = {
          ...base.customByChar[ch.id],
          ...parsed.customByChar[ch.id],
        };
      }
      if (parsed.accByChar?.[ch.id]) {
        base.accByChar[ch.id] = {
          ...base.accByChar[ch.id],
          ...parsed.accByChar[ch.id],
        };
      }
    }
  } catch {
    // Ignore storage read errors
  }
  return base;
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export const App: React.FC = () => {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<VTuberStage | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [loading, setLoading] = useState(true);
  const [switchingChar, setSwitchingChar] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [characterId, setCharacterId] = useState<CharacterId>('noob');
  const [rosterState, setRosterState] = useState<SavedRosterState>(() => loadSavedRosterState());

  const [emotion, setEmotion] = useState<EmotionId>('happy');
  const [animationMode, setAnimationMode] = useState<AnimationId>('live');
  const [background, setBackground] = useState<BackgroundId>('studio');
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('portrait');
  const [lighting, setLighting] = useState<LightingPresetId>('daylight');
  const [settings, setSettings] = useState<TrackingSettings>(DEFAULT_TRACKING_SETTINGS);

  const [webcamStatus, setWebcamStatus] = useState<WebcamStatus>('idle');
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [micStatus, setMicStatus] = useState<MicStatus>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [mouseTracking, setMouseTracking] = useState(true);
  const [demoSpeech, setDemoSpeech] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('customizer');
  const [obsMode, setObsMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(INITIAL_TELEMETRY);

  const activeMeta = useMemo(() => getCharacterMeta(characterId), [characterId]);
  const activeCustom = rosterState.customByChar[characterId];
  const activeAccessories = rosterState.accByChar[characterId];

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

  // Persist per-character customizations automatically
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rosterState));
    } catch {
      // Ignore quota errors
    }
  }, [rosterState]);

  // Initialize Three.js VTuber Stage once
  useEffect(() => {
    const container = stageContainerRef.current;
    if (!container) return;

    const initial = loadSavedRosterState();
    let stage: VTuberStage;
    try {
      stage = new VTuberStage(
        container,
        'noob',
        initial.customByChar.noob,
        initial.accByChar.noob,
        {
          onLoaded: () => setLoading(false),
          onCharacterSwitching: (sw) => setSwitchingChar(sw),
          onError: (msg) => {
            setLoading(false);
            setLoadError(msg);
          },
          onAnimationChange: (anim) => setAnimationMode(anim),
          onTelemetry: (snap) => setTelemetry(snap),
        },
      );
    } catch (err) {
      setLoading(false);
      setLoadError(
        err instanceof Error
          ? `Не удалось инициализировать WebGL: ${err.message}`
          : 'Не удалось инициализировать WebGL',
      );
      return;
    }
    stageRef.current = stage;

    return () => {
      stage.dispose();
      stageRef.current = null;
    };
  }, []);

  // Sync character + active customizer & accessories to Three.js stage
  useEffect(() => {
    stageRef.current?.setCharacter(characterId, activeCustom, activeAccessories);
  }, [characterId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    stageRef.current?.setCustomization(activeCustom);
  }, [activeCustom]);

  useEffect(() => {
    stageRef.current?.setAccessories(activeAccessories);
  }, [activeAccessories]);

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
    stageRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    stageRef.current?.setDemoSpeech(demoSpeech);
  }, [demoSpeech]);

  useEffect(() => {
    stageRef.current?.setMouseTracking(mouseTracking);
  }, [mouseTracking]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const key = e.key.toLowerCase();

      if (key >= '1' && key <= '8') {
        const em = EMOTIONS[parseInt(key, 10) - 1];
        if (em) setEmotion(em.id);
        return;
      }

      if (key === 'c' || key === 'с') {
        setObsMode(false);
        setDrawerOpen((open) => {
          if (open && drawerTab === 'customizer') return false;
          setDrawerTab('customizer');
          return true;
        });
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
  }, [drawerTab, showToast]);

  const handleSelectCharacter = useCallback(
    (id: CharacterId) => {
      if (id === characterId) return;
      setCharacterId(id);
      setAnimationMode('live');
      const meta = getCharacterMeta(id);
      showToast(`Персонаж: ${meta.name} (${meta.animations.length - 1} анимаций)`);
    },
    [characterId, showToast],
  );

  const handleUpdateCustomization = useCallback(
    (patch: Partial<CharacterCustomization>) => {
      setRosterState((prev) => ({
        ...prev,
        customByChar: {
          ...prev.customByChar,
          [characterId]: {
            ...prev.customByChar[characterId],
            ...patch,
          },
        },
      }));
    },
    [characterId],
  );

  const handleUpdateAccessories = useCallback(
    (patch: Partial<AccessoriesState>) => {
      setRosterState((prev) => ({
        ...prev,
        accByChar: {
          ...prev.accByChar,
          [characterId]: {
            ...prev.accByChar[characterId],
            ...patch,
          },
        },
      }));
    },
    [characterId],
  );

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = CUSTOM_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      const meta = getCharacterMeta(characterId);
      const res = preset.apply(meta);
      setRosterState((prev) => ({
        customByChar: {
          ...prev.customByChar,
          [characterId]: {
            ...prev.customByChar[characterId],
            ...res.custom,
          },
        },
        accByChar: res.accessories
          ? {
              ...prev.accByChar,
              [characterId]: {
                ...prev.accByChar[characterId],
                ...res.accessories,
              },
            }
          : prev.accByChar,
      }));
      showToast(`Применён скин: ${preset.emoji} ${preset.label}`);
    },
    [characterId, showToast],
  );

  const handleRandomizeSkin = useCallback(() => {
    const meta = getCharacterMeta(characterId);
    const skins = ['#edc114', '#eef0f4', '#cfd3da', '#fde68a', '#ffd5b8', '#fbcfe8', '#bae6fd'];
    const outfits = ['#0648a6', '#14151a', '#7c3aed', '#dc2626', '#059669', '#ec4899', '#0f766e', '#ea580c', '#1e293b'];
    const accents = ['#cd1515', '#38bdf8', '#f59e0b', '#ec4899', '#a855f7', '#22c55e', '#facc15', '#fb7185'];
    const eyes = ['#0c0c0c', '#1d4ed8', '#7c3aed', '#be123c', '#047857'];
    const faceStyles: FaceStyleId[] = ['auto', 'kawaii_dots', 'classic_pills', 'anime_sparkle'];

    const skin = pickRandom(skins);
    const outfit = pickRandom(outfits);
    const accent = pickRandom(accents);
    const legs = pickRandom(outfits);

    const nextCustom: CharacterCustomization = {
      skinColor: skin,
      torsoColor: outfit,
      armsColor: characterId === 'noob' ? skin : pickRandom([outfit, accent, '#14151a']),
      legsColor: legs,
      capVisible: meta.hasCap ? Math.random() > 0.25 : false,
      capDomeColor: outfit,
      capAccentColor: accent,
      shoeColor: accent,
      faceStyle: pickRandom(faceStyles),
      eyeColor: pickRandom(eyes),
      mouthColor: pickRandom(['#d8244e', '#ec4899', '#f97316', '#e11d48']),
      showPrint: Math.random() > 0.2,
      accessoryAccentColor: accent,
    };

    const nextAcc: AccessoriesState = {
      headphones: Math.random() < 0.35,
      crown: Math.random() < 0.25,
      sunglasses: Math.random() < 0.3,
      halo: Math.random() < 0.2,
      catEars: Math.random() < 0.35,
      bowtie: Math.random() < 0.3,
      wings: Math.random() < 0.25,
      blushAlways: Math.random() < 0.4,
    };

    setRosterState((prev) => ({
      customByChar: { ...prev.customByChar, [characterId]: nextCustom },
      accByChar: { ...prev.accByChar, [characterId]: nextAcc },
    }));
    showToast(`🎲 Случайная кастомка для ${meta.name}!`);
  }, [characterId, showToast]);

  const handleResetCustomization = useCallback(() => {
    const meta = getCharacterMeta(characterId);
    setRosterState((prev) => ({
      customByChar: { ...prev.customByChar, [characterId]: { ...meta.defaultCustomization } },
      accByChar: { ...prev.accByChar, [characterId]: { ...DEFAULT_ACCESSORIES } },
    }));
    showToast(`Сброшено к оригиналу: ${meta.name}`);
  }, [characterId, showToast]);

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
      showToast('Микрофон активен — говори, персонаж повторяет губами!');
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
    link.download = `${characterId}-vtuber-${emotion}.png`;
    link.click();
    showToast('Прозрачный PNG-стикер сохранён!');
  }, [characterId, emotion, showToast]);

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

  const handleOpenCustomizer = useCallback(() => {
    if (drawerOpen && drawerTab === 'customizer') {
      setDrawerOpen(false);
    } else {
      setDrawerTab('customizer');
      setDrawerOpen(true);
    }
  }, [drawerOpen, drawerTab]);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      {/* 100% Full-Viewport 3D VTuber Canvas */}
      <div
        ref={stageContainerRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Initial Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#f4f1ea]/95 backdrop-blur-md">
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/85 px-8 py-6 shadow-xl">
            <Loader2 className="h-9 w-9 animate-spin text-[#0648a6]" />
            <div className="font-display text-lg font-bold text-slate-900">
              Загружаем VTuber Studio…
            </div>
            <p className="text-xs text-slate-500">
              Подготавливаем 3 персонажей (Noob, Guest, Modern Guest), кастомку и живую мимику
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

      {/* Main Studio UI */}
      {!obsMode && !loading && !loadError && (
        <>
          <TopBar
            characterId={characterId}
            switchingChar={switchingChar}
            webcamStatus={webcamStatus}
            micStatus={micStatus}
            mouseTracking={mouseTracking}
            demoSpeech={demoSpeech}
            drawerOpen={drawerOpen}
            isCustomizerActive={drawerOpen && drawerTab === 'customizer'}
            darkUi={darkUi}
            telemetry={telemetry}
            onSelectCharacter={handleSelectCharacter}
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
            onOpenCustomizer={handleOpenCustomizer}
            onToggleDrawer={() => {
              if (drawerOpen) {
                setDrawerOpen(false);
              } else {
                setDrawerTab('tracking');
                setDrawerOpen(true);
              }
            }}
          />

          <StudioDrawer
            open={drawerOpen}
            tab={drawerTab}
            darkUi={darkUi}
            characterId={characterId}
            customization={activeCustom}
            accessories={activeAccessories}
            webcamStatus={webcamStatus}
            webcamError={webcamError}
            micError={micError}
            telemetry={telemetry}
            settings={settings}
            background={background}
            cameraPreset={cameraPreset}
            lighting={lighting}
            onChangeTab={setDrawerTab}
            onClose={() => setDrawerOpen(false)}
            onSelectCharacter={handleSelectCharacter}
            onUpdateCustomization={handleUpdateCustomization}
            onApplyPreset={handleApplyPreset}
            onRandomizeSkin={handleRandomizeSkin}
            onResetCustomization={handleResetCustomization}
            onUpdateAccessories={handleUpdateAccessories}
            onAttachPreviewCanvas={handleAttachPreviewCanvas}
            onCalibrateWebcam={handleCalibrateWebcam}
            onToggleWebcam={() => void handleToggleWebcam()}
            onUpdateSettings={handleUpdateSettings}
            onSelectBackground={setBackground}
            onSelectCameraPreset={handleCameraPreset}
            onSelectLighting={setLighting}
            onSnapshot={handleSnapshot}
          />

          <BottomDock
            emotion={emotion}
            animationMode={animationMode}
            animations={activeMeta.animations}
            darkUi={darkUi}
            onSelectEmotion={setEmotion}
            onSelectAnimation={setAnimationMode}
          />

          <div
            className={`pointer-events-none fixed bottom-4 left-4 z-20 hidden items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-medium 2xl:flex ${
              darkUi
                ? 'bg-slate-900/50 text-slate-300 backdrop-blur-md'
                : 'bg-white/60 text-slate-600 backdrop-blur-md'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>C — кастомка · 1–8 эмоции · H — OBS</span>
          </div>
        </>
      )}

      {/* Discrete restore button in OBS mode */}
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
