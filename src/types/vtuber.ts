export type EmotionId =
  | 'happy'
  | 'surprised'
  | 'blush'
  | 'hype'
  | 'wink'
  | 'angry'
  | 'sleepy'
  | 'cry';

export type AnimationId =
  | 'live'
  | '01_Happy_Bounce_Idle'
  | '02_Cute_Waddle_Walk'
  | '03_Excited_Jump_Wave'
  | '04_Happy_Baby_Dance'
  | '05_Playful_Spin_Jump';

export type BackgroundId =
  | 'studio'
  | 'roblox_meadow'
  | 'cozy_night'
  | 'chroma_green'
  | 'chroma_blue'
  | 'clean_white';

export type CameraPresetId = 'portrait' | 'fullbody' | 'closeup' | 'free';

export type LightingPresetId = 'daylight' | 'studio' | 'sunset' | 'stream';

export type WebcamStatus = 'idle' | 'loading' | 'active' | 'error';

export type MicStatus = 'idle' | 'active' | 'error';

export interface AccessoriesState {
  headphones: boolean;
  crown: boolean;
  sunglasses: boolean;
  halo: boolean;
  blushAlways: boolean;
}

export interface TrackingSettings {
  headSensitivity: number; // 0.3 .. 2.0
  bodySway: number; // 0.0 .. 1.5
  smoothing: number; // 0.1 .. 0.95
  bouncePhysics: number; // 0.0 .. 1.6
  autoBlink: boolean;
  micGain: number; // 0.5 .. 3.0
  mirrorCamera: boolean;
  eyeTracking: boolean;
  headpatEnabled: boolean;
}

export interface RawWebcamPose {
  yaw: number; // radians, +right / -left
  pitch: number; // radians, +down / -up
  roll: number; // radians, +tilt right
  x: number; // normalized -1..1
  y: number; // normalized -1..1
  blinkL: number; // 0..1 (viewer's left eye)
  blinkR: number; // 0..1 (viewer's right eye)
  gazeX: number; // -1..1
  gazeY: number; // -1..1
  jawOpen: number; // 0..1
  mouthSmile: number; // -1..1
  mouthRound: number; // 0..1
  browUp: number; // 0..1
  browDown: number; // 0..1
  faceDetected: boolean;
}

export interface FaceRenderState {
  emotion: EmotionId;
  blinkL: number; // 0..1
  blinkR: number; // 0..1
  gazeX: number; // -1..1
  gazeY: number; // -1..1
  mouthOpen: number; // 0..1
  mouthSmile: number; // -1..1
  mouthRound: number; // 0..1
  browUp: number; // 0..1
  browDown: number; // 0..1
  blushIntensity: number; // 0..1
  isLipSyncActive: boolean;
  time: number;
}

export interface TelemetrySnapshot {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
  blinkL: number;
  blinkR: number;
  mouthOpen: number;
  audioLevel: number;
  isTalking: boolean;
  faceDetected: boolean;
  fps: number;
  spectrum: number[];
}

export interface EmotionMeta {
  id: EmotionId;
  label: string;
  hotkey: string;
  emoji: string;
  accent: string;
}

export const EMOTIONS: EmotionMeta[] = [
  { id: 'happy', label: 'Радость', hotkey: '1', emoji: '😄', accent: '#f59e0b' },
  { id: 'surprised', label: 'Удивление', hotkey: '2', emoji: '😮', accent: '#0ea5e9' },
  { id: 'blush', label: 'Смущение', hotkey: '3', emoji: '😊', accent: '#f43f5e' },
  { id: 'hype', label: 'Хайп', hotkey: '4', emoji: '🤩', accent: '#eab308' },
  { id: 'wink', label: 'Подмиг', hotkey: '5', emoji: '😉', accent: '#10b981' },
  { id: 'angry', label: 'Злюка', hotkey: '6', emoji: '😠', accent: '#ef4444' },
  { id: 'sleepy', label: 'Сонный', hotkey: '7', emoji: '😴', accent: '#6366f1' },
  { id: 'cry', label: 'Плачет', hotkey: '8', emoji: '🥺', accent: '#3b82f6' },
];

export interface AnimationMeta {
  id: AnimationId;
  label: string;
  shortLabel: string;
  loop: boolean;
}

export const ANIMATIONS: AnimationMeta[] = [
  { id: 'live', label: 'Живой VTuber', shortLabel: 'VTuber', loop: true },
  { id: '01_Happy_Bounce_Idle', label: 'Счастливый отскок', shortLabel: 'Idle', loop: true },
  { id: '02_Cute_Waddle_Walk', label: 'Милая походка', shortLabel: 'Walk', loop: true },
  { id: '03_Excited_Jump_Wave', label: 'Приветствие', shortLabel: 'Wave', loop: false },
  { id: '04_Happy_Baby_Dance', label: 'Танец Нуба', shortLabel: 'Dance', loop: true },
  { id: '05_Playful_Spin_Jump', label: 'Сальто-прыжок', shortLabel: 'Spin', loop: false },
];

export interface BackgroundMeta {
  id: BackgroundId;
  label: string;
  description: string;
  swatch: string;
  isDarkUi?: boolean;
}

export const BACKGROUNDS: BackgroundMeta[] = [
  {
    id: 'studio',
    label: 'Тёплая студия',
    description: 'Мягкий студийный свет и подиум',
    swatch: 'linear-gradient(135deg, #fff8e7 0%, #dbeafe 100%)',
  },
  {
    id: 'roblox_meadow',
    label: 'Roblox Лужайка',
    description: 'Небо и классическая зелёная клетка',
    swatch: 'linear-gradient(180deg, #60b8ff 0%, #bae6fd 58%, #84cc16 58%, #65a30d 100%)',
  },
  {
    id: 'cozy_night',
    label: 'Ночной стрим',
    description: 'Уютная вечерняя подсветка стримера',
    swatch: 'linear-gradient(135deg, #172038 0%, #2b235a 60%, #4c2a59 100%)',
    isDarkUi: true,
  },
  {
    id: 'chroma_green',
    label: 'Хромакей Зелёный',
    description: 'Чистый #00FF00 для OBS Studio',
    swatch: '#00ff00',
  },
  {
    id: 'chroma_blue',
    label: 'Хромакей Синий',
    description: 'Чистый #0000FF для OBS Studio',
    swatch: '#0000ff',
    isDarkUi: true,
  },
  {
    id: 'clean_white',
    label: 'Белая циклорама',
    description: 'Минималистичный чистый фон',
    swatch: '#f8fafc',
  },
];

export const DEFAULT_ACCESSORIES: AccessoriesState = {
  headphones: false,
  crown: false,
  sunglasses: false,
  halo: false,
  blushAlways: false,
};

export const DEFAULT_TRACKING_SETTINGS: TrackingSettings = {
  headSensitivity: 1.0,
  bodySway: 0.75,
  smoothing: 0.55,
  bouncePhysics: 1.0,
  autoBlink: true,
  micGain: 1.35,
  mirrorCamera: true,
  eyeTracking: true,
  headpatEnabled: true,
};
