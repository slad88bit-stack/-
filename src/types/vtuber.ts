export type CharacterId = 'noob' | 'guest' | 'modern_guest';

export type FaceStyleId = 'auto' | 'kawaii_dots' | 'classic_pills' | 'anime_sparkle';

export type EmotionId =
  | 'happy'
  | 'surprised'
  | 'blush'
  | 'hype'
  | 'wink'
  | 'angry'
  | 'sleepy'
  | 'cry';

export type AnimationId = string; // 'live' or exact glTF clip name

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
  catEars: boolean;
  bowtie: boolean;
  wings: boolean;
  blushAlways: boolean;
}

export interface CharacterCustomization {
  skinColor: string;
  torsoColor: string;
  armsColor: string;
  legsColor: string;
  capVisible: boolean;
  capDomeColor: string;
  capAccentColor: string;
  shoeColor: string;
  faceStyle: FaceStyleId;
  eyeColor: string;
  mouthColor: string;
  showPrint: boolean;
  accessoryAccentColor: string;
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
  yaw: number;
  pitch: number;
  roll: number;
  x: number;
  y: number;
  blinkL: number;
  blinkR: number;
  gazeX: number;
  gazeY: number;
  jawOpen: number;
  mouthSmile: number;
  mouthRound: number;
  browUp: number;
  browDown: number;
  faceDetected: boolean;
}

export interface FaceRenderState {
  characterId: CharacterId;
  faceStyle: FaceStyleId;
  skinColor: string;
  eyeColor: string;
  mouthColor: string;
  emotion: EmotionId;
  blinkL: number;
  blinkR: number;
  gazeX: number;
  gazeY: number;
  mouthOpen: number;
  mouthSmile: number;
  mouthRound: number;
  browUp: number;
  browDown: number;
  blushIntensity: number;
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

export interface CharacterMeta {
  id: CharacterId;
  name: string;
  shortName: string;
  subtitle: string;
  modelUrl: string;
  downloadName: string;
  sourceFile: string;
  badgeColor: string;
  hasCap: boolean;
  hasShoes: boolean;
  defaultCustomization: CharacterCustomization;
  animations: AnimationMeta[];
}

export const CHARACTERS: CharacterMeta[] = [
  {
    id: 'noob',
    name: 'Baby Noob',
    shortName: 'Noob',
    subtitle: 'Классический Нуб',
    modelUrl: '/models/baby_noob.glb',
    downloadName: 'baby_noob_vtuber.glb',
    sourceFile: 'baby_noob_animated.blend',
    badgeColor: '#edc114',
    hasCap: false,
    hasShoes: false,
    defaultCustomization: {
      skinColor: '#edc114',
      torsoColor: '#0648a6',
      armsColor: '#edc114',
      legsColor: '#99b236',
      capVisible: false,
      capDomeColor: '#141418',
      capAccentColor: '#cd1515',
      shoeColor: '#8f1d26',
      faceStyle: 'auto',
      eyeColor: '#0c0c0c',
      mouthColor: '#d8244e',
      showPrint: true,
      accessoryAccentColor: '#38bdf8',
    },
    animations: [
      { id: 'live', label: 'Живой VTuber', shortLabel: 'VTuber', loop: true },
      { id: '01_Happy_Bounce_Idle', label: 'Счастливый отскок', shortLabel: 'Idle', loop: true },
      { id: '02_Cute_Waddle_Walk', label: 'Милая походка', shortLabel: 'Walk', loop: true },
      { id: '03_Excited_Jump_Wave', label: 'Приветствие', shortLabel: 'Wave', loop: false },
      { id: '04_Happy_Baby_Dance', label: 'Танец Нуба', shortLabel: 'Dance', loop: true },
      { id: '05_Playful_Spin_Jump', label: 'Сальто-прыжок', shortLabel: 'Spin', loop: false },
    ],
  },
  {
    id: 'guest',
    name: 'Baby Guest',
    shortName: 'Guest',
    subtitle: 'Классический Гость',
    modelUrl: '/models/baby_guest.glb',
    downloadName: 'baby_guest_vtuber.glb',
    sourceFile: 'baby_guest_animated.glb',
    badgeColor: '#dc2626',
    hasCap: true,
    hasShoes: false,
    defaultCustomization: {
      skinColor: '#eef0f4',
      torsoColor: '#14151a',
      armsColor: '#14151a',
      legsColor: '#14151a',
      capVisible: true,
      capDomeColor: '#14151a',
      capAccentColor: '#cd1515',
      shoeColor: '#8f1d26',
      faceStyle: 'auto',
      eyeColor: '#111318',
      mouthColor: '#d8244e',
      showPrint: true,
      accessoryAccentColor: '#ef4444',
    },
    animations: [
      { id: 'live', label: 'Живой VTuber', shortLabel: 'VTuber', loop: true },
      { id: 'Emote_California_Girls', label: 'California Girls', shortLabel: 'Cali', loop: true },
      { id: 'Guest_01_Cool_Cap_Idle', label: 'Крутой Idle', shortLabel: 'Idle', loop: true },
      { id: 'Guest_02_Swagger_Walk', label: 'Сваг-походка', shortLabel: 'Walk', loop: true },
      { id: 'Guest_03_Hype_Jump_Salute', label: 'Прыжок-салют', shortLabel: 'Salute', loop: false },
      { id: 'Guest_04_Breakdance_Groove', label: 'Брейкданс', shortLabel: 'Break', loop: true },
      { id: 'Guest_05_360_Frontflip', label: 'Сальто 360°', shortLabel: 'Flip', loop: false },
      { id: 'Guest_06_Turbo_Sprint', label: 'Турбо-спринт', shortLabel: 'Sprint', loop: true },
    ],
  },
  {
    id: 'modern_guest',
    name: 'Modern Guest',
    shortName: 'Modern',
    subtitle: 'Современный Гость',
    modelUrl: '/models/baby_modern_guest.glb',
    downloadName: 'baby_modern_guest_vtuber.glb',
    sourceFile: 'baby_modern_guest_animated.glb',
    badgeColor: '#2563eb',
    hasCap: true,
    hasShoes: true,
    defaultCustomization: {
      skinColor: '#cfd3da',
      torsoColor: '#1a1b20',
      armsColor: '#1a1b20',
      legsColor: '#202a38',
      capVisible: true,
      capDomeColor: '#14151a',
      capAccentColor: '#1d1f26',
      shoeColor: '#8f1d26',
      faceStyle: 'auto',
      eyeColor: '#111318',
      mouthColor: '#d8244e',
      showPrint: true,
      accessoryAccentColor: '#38bdf8',
    },
    animations: [
      { id: 'live', label: 'Живой VTuber', shortLabel: 'VTuber', loop: true },
      { id: 'Emote_California_Girls', label: 'California Girls', shortLabel: 'Cali', loop: true },
      { id: 'ModGuest_01_Chill_Pocket_Idle', label: 'Чилл-стойка', shortLabel: 'Idle', loop: true },
      { id: 'ModGuest_02_Sneaker_Bounce_Walk', label: 'Походка в кедах', shortLabel: 'Walk', loop: true },
      { id: 'ModGuest_03_Parkour_Vault_Jump', label: 'Паркур-прыжок', shortLabel: 'Vault', loop: false },
      { id: 'ModGuest_04_Shuffle_Footwork_Dance', label: 'Шаффл-танец', shortLabel: 'Shuffle', loop: true },
      { id: 'ModGuest_05_360_Backflip', label: 'Бэкфлип 360°', shortLabel: 'Backflip', loop: false },
      { id: 'ModGuest_06_Parkour_Dash_Run', label: 'Паркур-рывок', shortLabel: 'Dash', loop: true },
    ],
  },
];

export function getCharacterMeta(id: CharacterId): CharacterMeta {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export interface CustomSkinPreset {
  id: string;
  label: string;
  emoji: string;
  swatch: string;
  apply: (char: CharacterMeta) => {
    custom: Partial<CharacterCustomization>;
    accessories?: Partial<AccessoriesState>;
  };
}

export const CUSTOM_PRESETS: CustomSkinPreset[] = [
  {
    id: 'original',
    label: 'Оригинал',
    emoji: '✨',
    swatch: 'linear-gradient(135deg, #facc15 0%, #2563eb 50%, #18181b 100%)',
    apply: (char) => ({
      custom: { ...char.defaultCustomization },
      accessories: { ...DEFAULT_ACCESSORIES },
    }),
  },
  {
    id: 'cyber_neon',
    label: 'Кибер-неон',
    emoji: '⚡',
    swatch: 'linear-gradient(135deg, #0f172a 0%, #7c3aed 55%, #06b6d4 100%)',
    apply: (char) => ({
      custom: {
        skinColor: char.id === 'noob' ? '#fde047' : '#e2e8f0',
        torsoColor: '#13162b',
        armsColor: '#1e1b4b',
        legsColor: '#0f172a',
        capVisible: char.hasCap,
        capDomeColor: '#13162b',
        capAccentColor: '#06b6d4',
        shoeColor: '#7c3aed',
        faceStyle: 'anime_sparkle',
        eyeColor: '#0284c7',
        mouthColor: '#ec4899',
        showPrint: true,
        accessoryAccentColor: '#22d3ee',
      },
      accessories: {
        headphones: true,
        sunglasses: false,
        crown: false,
        halo: false,
        catEars: false,
        bowtie: false,
        wings: false,
        blushAlways: false,
      },
    }),
  },
  {
    id: 'gold_vip',
    label: 'Золотой VIP',
    emoji: '👑',
    swatch: 'linear-gradient(135deg, #18181b 0%, #f59e0b 60%, #fef08a 100%)',
    apply: (char) => ({
      custom: {
        skinColor: char.id === 'noob' ? '#f5c518' : '#f4f4f5',
        torsoColor: '#18181b',
        armsColor: '#27272a',
        legsColor: '#18181b',
        capVisible: false,
        capDomeColor: '#18181b',
        capAccentColor: '#f59e0b',
        shoeColor: '#d97706',
        faceStyle: 'auto',
        eyeColor: '#111111',
        mouthColor: '#e11d48',
        showPrint: true,
        accessoryAccentColor: '#fbbf24',
      },
      accessories: {
        crown: true,
        sunglasses: true,
        bowtie: true,
        headphones: false,
        halo: false,
        catEars: false,
        wings: false,
        blushAlways: false,
      },
    }),
  },
  {
    id: 'kawaii_pastel',
    label: 'Каваий',
    emoji: '🌸',
    swatch: 'linear-gradient(135deg, #fbcfe8 0%, #c4b5fd 55%, #bae6fd 100%)',
    apply: (char) => ({
      custom: {
        skinColor: char.id === 'noob' ? '#ffe380' : '#fff5f7',
        torsoColor: '#f472b6',
        armsColor: '#f9a8d4',
        legsColor: '#a78bfa',
        capVisible: char.hasCap,
        capDomeColor: '#c4b5fd',
        capAccentColor: '#fb7185',
        shoeColor: '#ec4899',
        faceStyle: 'anime_sparkle',
        eyeColor: '#7c3aed',
        mouthColor: '#fb7185',
        showPrint: true,
        accessoryAccentColor: '#f472b6',
      },
      accessories: {
        catEars: true,
        blushAlways: true,
        bowtie: true,
        headphones: false,
        crown: false,
        sunglasses: false,
        halo: false,
        wings: false,
      },
    }),
  },
  {
    id: 'redline_gamer',
    label: 'Геймер',
    emoji: '🎮',
    swatch: 'linear-gradient(135deg, #111827 0%, #dc2626 65%, #f97316 100%)',
    apply: (char) => ({
      custom: {
        skinColor: char.id === 'noob' ? '#f4c430' : '#f1f5f9',
        torsoColor: '#18181b',
        armsColor: '#991b1b',
        legsColor: '#1f2937',
        capVisible: char.hasCap,
        capDomeColor: '#18181b',
        capAccentColor: '#ef4444',
        shoeColor: '#dc2626',
        faceStyle: 'auto',
        eyeColor: '#0f172a',
        mouthColor: '#ef4444',
        showPrint: true,
        accessoryAccentColor: '#ef4444',
      },
      accessories: {
        headphones: true,
        crown: false,
        sunglasses: false,
        halo: false,
        catEars: false,
        bowtie: false,
        wings: false,
        blushAlways: false,
      },
    }),
  },
  {
    id: 'angel_stream',
    label: 'Ангел',
    emoji: '😇',
    swatch: 'linear-gradient(135deg, #ffffff 0%, #bae6fd 55%, #fde68a 100%)',
    apply: (char) => ({
      custom: {
        skinColor: char.id === 'noob' ? '#fde68a' : '#f8fafc',
        torsoColor: '#e0f2fe',
        armsColor: '#f0f9ff',
        legsColor: '#7dd3fc',
        capVisible: false,
        capDomeColor: '#f8fafc',
        capAccentColor: '#38bdf8',
        shoeColor: '#0284c7',
        faceStyle: 'kawaii_dots',
        eyeColor: '#1e3a8a',
        mouthColor: '#fb7185',
        showPrint: false,
        accessoryAccentColor: '#38bdf8',
      },
      accessories: {
        halo: true,
        wings: true,
        blushAlways: true,
        headphones: false,
        crown: false,
        sunglasses: false,
        catEars: false,
        bowtie: false,
      },
    }),
  },
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
  catEars: false,
  bowtie: false,
  wings: false,
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
