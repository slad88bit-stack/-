import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type {
  AccessoriesState,
  AnimationId,
  BackgroundId,
  CameraPresetId,
  EmotionId,
  LightingPresetId,
  TelemetrySnapshot,
  TrackingSettings,
} from '../types/vtuber';
import { ANIMATIONS, DEFAULT_ACCESSORIES, DEFAULT_TRACKING_SETTINGS } from '../types/vtuber';
import { BABY_NOOB_BLUE_HEX, FaceCanvasEngine } from './FaceCanvasEngine';
import { buildHeadAccessories } from './AccessoriesBuilder';
import { AudioLipSync, sampleDemoSpeech } from './AudioLipSync';
import { WebcamTracker } from './WebcamTracker';

interface BoneRestPose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

interface FloatingParticle {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  baseScale: number;
}

interface CameraGoal {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

const CAMERA_PRESETS: Record<Exclude<CameraPresetId, 'free'>, { pos: [number, number, number]; target: [number, number, number] }> = {
  portrait: { pos: [0, 1.06, 2.25], target: [0, 0.98, 0] },
  fullbody: { pos: [0.18, 1.02, 3.35], target: [0, 0.78, 0] },
  closeup: { pos: [0, 1.13, 1.62], target: [0, 1.11, 0] },
};

function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function createGradientTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [offset, color] of stops) {
    grad.addColorStop(offset, color);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 16, 512);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createGrassCheckerTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#79be3b';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#89cd47';
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 8;
  return tex;
}

function createParticleTexture(kind: 'heart' | 'star' | 'bokeh'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 128, 128);

  if (kind === 'heart') {
    ctx.fillStyle = '#ff5b86';
    ctx.beginPath();
    ctx.moveTo(64, 104);
    ctx.bezierCurveTo(18, 72, 16, 30, 42, 24);
    ctx.bezierCurveTo(54, 21, 61, 30, 64, 38);
    ctx.bezierCurveTo(67, 30, 74, 21, 86, 24);
    ctx.bezierCurveTo(112, 30, 110, 72, 64, 104);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(44, 42, 10, 6, -0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'star') {
    ctx.fillStyle = '#ffd942';
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 50 : 18;
      const a = (i * Math.PI) / 4 - Math.PI / 2;
      const x = 64 + Math.cos(a) * r;
      const y = 64 + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 58);
    g.addColorStop(0, 'rgba(255, 224, 150, 0.72)');
    g.addColorStop(0.5, 'rgba(167, 139, 250, 0.25)');
    g.addColorStop(1, 'rgba(167, 139, 250, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface StageCallbacks {
  onLoaded?: () => void;
  onError?: (msg: string) => void;
  onAnimationChange?: (anim: AnimationId) => void;
  onTelemetry?: (snapshot: TelemetrySnapshot) => void;
  onHeadpat?: () => void;
}

export class VTuberStage {
  private readonly container: HTMLElement;
  private readonly callbacks: StageCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;

  // Lighting
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly keyLight: THREE.DirectionalLight;
  private readonly fillLight: THREE.DirectionalLight;
  private readonly rimLight: THREE.DirectionalLight;

  // Stage backdrops & props
  private readonly stageGroup = new THREE.Group();
  private readonly studioFloor: THREE.Mesh;
  private readonly studioDisc: THREE.Mesh;
  private readonly grassFloor: THREE.Mesh;
  private readonly shadowFloor: THREE.Mesh;
  private readonly cloudGroup = new THREE.Group();
  private readonly nightBokehGroup = new THREE.Group();
  private readonly bgTextures: Record<'studio' | 'roblox_meadow' | 'cozy_night', THREE.CanvasTexture>;

  // Character rig & animations
  private characterRoot: THREE.Object3D | null = null;
  private characterMeshes: THREE.Object3D[] = [];
  private bones = new Map<string, THREE.Bone>();
  private boneRest = new Map<string, BoneRestPose>();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private activeAction: THREE.AnimationAction | null = null;

  // VTuber subsystems
  private readonly faceEngine = new FaceCanvasEngine();
  private readonly accessories = buildHeadAccessories();
  public readonly webcam = new WebcamTracker();
  public readonly audio = new AudioLipSync();

  // Particles (headpat hearts/stars)
  private readonly heartTex = createParticleTexture('heart');
  private readonly starTex = createParticleTexture('star');
  private readonly particles: FloatingParticle[] = [];

  // Runtime state
  private emotion: EmotionId = 'happy';
  private animationMode: AnimationId = 'live';
  private backgroundId: BackgroundId = 'studio';
  private accessoriesState: AccessoriesState = { ...DEFAULT_ACCESSORIES };
  private settings: TrackingSettings = { ...DEFAULT_TRACKING_SETTINGS };
  private demoSpeech = false;
  private mouseTracking = true;

  // Smooth rig pose state
  private curYaw = 0;
  private curPitch = 0;
  private curRoll = 0;
  private curBodyX = 0;
  private curBodyY = 0;
  private curGazeX = 0;
  private curGazeY = 0;
  private curBlinkL = 0;
  private curBlinkR = 0;
  private curMouthOpen = 0;
  private curMouthSmile = 0.65;
  private curMouthRound = 0;
  private curBrowUp = 0;
  private curBrowDown = 0;
  private curAudioLevel = 0;

  // Pointer & interaction
  private pointerNdc = new THREE.Vector2(0, 0);
  private pointerDownPos = new THREE.Vector2(0, 0);
  private readonly raycaster = new THREE.Raycaster();
  private headpatTimer = 0;
  private headpatSquish = 0;

  // Auto-blink state machine
  private nextBlinkAt = 2.6;
  private blinkPhase = -1; // -1 = idle, 0..1 = blinking
  private blinkDuration = 0.16;
  private doubleBlinkQueued = false;

  // Camera transition
  private cameraGoal: CameraGoal | null = null;

  // Loop & telemetry
  private rafId = 0;
  private lastTime = performance.now();
  private elapsed = 0;
  private telemetryTimer = 0;
  private fpsFrames = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private disposed = false;

  // Reusable math objects
  private readonly tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpVec = new THREE.Vector3();

  constructor(container: HTMLElement, callbacks: StageCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // 2. Scene & Studio IBL Reflections
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.scene.environmentIntensity = 0.52;
    pmrem.dispose();

    // 3. Camera & OrbitControls
    const aspect = (container.clientWidth || window.innerWidth) / Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(32, aspect, 0.1, 80);
    this.camera.position.set(...CAMERA_PRESETS.portrait.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...CAMERA_PRESETS.portrait.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.1;
    this.controls.maxDistance = 6.0;
    this.controls.maxPolarAngle = Math.PI * 0.56;
    this.controls.minPolarAngle = Math.PI * 0.16;
    this.controls.enablePan = true;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      this.cameraGoal = null;
    });

    // 4. Three-point Studio Lighting
    this.hemiLight = new THREE.HemisphereLight(0xfffcf5, 0xc7d2e8, 0.85);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff9ef, 1.9);
    this.keyLight.position.set(-2.3, 3.8, 3.5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 14;
    this.keyLight.shadow.camera.left = -2.2;
    this.keyLight.shadow.camera.right = 2.2;
    this.keyLight.shadow.camera.top = 2.4;
    this.keyLight.shadow.camera.bottom = -1.2;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.015;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xdbeafe, 0.78);
    this.fillLight.position.set(3.0, 2.2, 2.4);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xffe6a8, 0.95);
    this.rimLight.position.set(1.2, 2.8, -3.2);
    this.scene.add(this.rimLight);

    // 5. Backgrounds & Stage Props
    this.bgTextures = {
      studio: createGradientTexture([
        [0, '#f7f3e9'],
        [0.52, '#edf3fb'],
        [1, '#e1e9f5'],
      ]),
      roblox_meadow: createGradientTexture([
        [0, '#3aa0ff'],
        [0.45, '#8fd3ff'],
        [0.72, '#d8f2ff'],
        [1, '#b6e6a1'],
      ]),
      cozy_night: createGradientTexture([
        [0, '#101628'],
        [0.5, '#1d2244'],
        [0.85, '#302350'],
        [1, '#1a1530'],
      ]),
    };

    // Studio floor + sleek subtle podium disc
    this.studioFloor = new THREE.Mesh(
      new THREE.CircleGeometry(10, 64),
      new THREE.MeshStandardMaterial({ color: 0xeae5db, roughness: 0.92, metalness: 0 }),
    );
    this.studioFloor.rotation.x = -Math.PI / 2;
    this.studioFloor.position.y = -0.002;
    this.studioFloor.receiveShadow = true;
    this.stageGroup.add(this.studioFloor);

    this.studioDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.02, 0.04, 48),
      new THREE.MeshStandardMaterial({ color: 0xfbf9f4, roughness: 0.55, metalness: 0.02 }),
    );
    this.studioDisc.position.y = -0.02;
    this.studioDisc.receiveShadow = true;
    this.stageGroup.add(this.studioDisc);

    // Roblox Meadow Checker Grass (homage to Mat_Studio_Grass in baby_noob_animated.blend!)
    this.grassFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 36),
      new THREE.MeshStandardMaterial({
        map: createGrassCheckerTexture(),
        roughness: 0.88,
        metalness: 0,
      }),
    );
    this.grassFloor.rotation.x = -Math.PI / 2;
    this.grassFloor.position.y = -0.002;
    this.grassFloor.receiveShadow = true;
    this.grassFloor.visible = false;
    this.stageGroup.add(this.grassFloor);

    // Stylized blocky Roblox clouds for Meadow scene
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    const cloudPositions: Array<[number, number, number, number]> = [
      [-4.2, 3.6, -8.5, 1.15],
      [3.8, 4.1, -9.8, 1.35],
      [-0.8, 4.6, -11.5, 0.95],
      [6.4, 3.2, -11.0, 1.0],
    ];
    for (const [cx, cy, cz, sc] of cloudPositions) {
      const cGroup = new THREE.Group();
      const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.55, 0.9), cloudMat);
      const topBlock = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.48, 0.78), cloudMat);
      topBlock.position.set(-0.22, 0.36, 0);
      const sideBlock = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.38, 0.72), cloudMat);
      sideBlock.position.set(0.62, 0.22, 0.05);
      cGroup.add(mainBlock, topBlock, sideBlock);
      cGroup.position.set(cx, cy, cz);
      cGroup.scale.setScalar(sc);
      this.cloudGroup.add(cGroup);
    }
    this.cloudGroup.visible = false;
    this.stageGroup.add(this.cloudGroup);

    // Cozy night floating warm bokeh sprites
    const bokehTex = createParticleTexture('bokeh');
    for (let i = 0; i < 18; i++) {
      const mat = new THREE.SpriteMaterial({
        map: bokehTex,
        transparent: true,
        opacity: 0.25 + (i % 4) * 0.1,
        depthWrite: false,
      });
      const sp = new THREE.Sprite(mat);
      const angle = (i / 18) * Math.PI * 2;
      const dist = 2.6 + (i % 5) * 0.7;
      sp.position.set(Math.cos(angle) * dist, 0.4 + (i % 6) * 0.42, -1.8 - (i % 4) * 0.9);
      const sz = 0.28 + (i % 4) * 0.16;
      sp.scale.set(sz, sz, 1);
      sp.userData = { baseY: sp.position.y, speed: 0.4 + (i % 5) * 0.15, phase: i * 0.9 };
      this.nightBokehGroup.add(sp);
    }
    this.nightBokehGroup.visible = false;
    this.stageGroup.add(this.nightBokehGroup);

    // Shadow-only floor for clean_white
    this.shadowFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.ShadowMaterial({ opacity: 0.14 }),
    );
    this.shadowFloor.rotation.x = -Math.PI / 2;
    this.shadowFloor.position.y = -0.001;
    this.shadowFloor.receiveShadow = true;
    this.shadowFloor.visible = false;
    this.stageGroup.add(this.shadowFloor);

    this.scene.add(this.stageGroup);
    this.setBackground('studio');

    // 6. Bind DOM listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp);

    // 7. Load exported Baby Noob GLB
    void this.loadCharacter();

    // 8. Start animation loop
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  private async loadCharacter(): Promise<void> {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('/models/baby_noob.glb');
      if (this.disposed) return;

      const root = gltf.scene;
      this.characterRoot = root;
      this.characterMeshes = [];

      // Prepare composited Roblox chest badge texture (exact #0648a6 blue + 2px clean border for ClampToEdge)
      const badgeTexture = await this.createTorsoBadgeTexture();

      root.traverse((obj) => {
        if ((obj as THREE.Bone).isBone) {
          const bone = obj as THREE.Bone;
          this.bones.set(bone.name, bone);
          this.boneRest.set(bone.name, {
            position: bone.position.clone(),
            quaternion: bone.quaternion.clone(),
            scale: bone.scale.clone(),
          });
        }

        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.characterMeshes.push(mesh);

          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (!mat) return;

          if (mesh.name === 'Baby_Head' || mat.name === 'Mat_BabyNoob_Head') {
            mat.color.setHex(0xffffff);
            mat.map = this.faceEngine.texture;
            mat.roughness = 0.28;
            mat.metalness = 0.0;
            mat.needsUpdate = true;
          } else if (mesh.name === 'Baby_Torso' || mat.name === 'Mat_BabyNoob_Torso') {
            if (badgeTexture) {
              mat.color.setHex(0xffffff);
              mat.map = badgeTexture;
            }
            mat.roughness = 0.32;
            mat.metalness = 0.0;
            mat.needsUpdate = true;
          } else if (mat.name === 'Mat_BabyNoob_Limbs') {
            mat.roughness = 0.28;
            mat.metalness = 0.0;
          } else if (mat.name === 'Mat_BabyNoob_Legs') {
            mat.roughness = 0.34;
            mat.metalness = 0.0;
          }
        }
      });

      // Attach 3D VTuber accessories directly to Head bone so they move/squash with head!
      const headBone = this.bones.get('Head');
      if (headBone) {
        headBone.add(this.accessories.root);
        this.accessories.applyState(this.accessoriesState);
      }

      // Setup AnimationMixer for all 5 authentic Blender actions
      this.mixer = new THREE.AnimationMixer(root);
      this.mixer.addEventListener('finished', () => {
        // When a one-shot Blender animation (Wave / Spin) finishes, smoothly return to Live VTuber mode
        if (this.animationMode !== 'live') {
          const meta = ANIMATIONS.find((a) => a.id === this.animationMode);
          if (meta && !meta.loop) {
            this.setAnimationMode('live');
            this.callbacks.onAnimationChange?.('live');
          }
        }
      });

      for (const clip of gltf.animations) {
        const action = this.mixer.clipAction(clip);
        this.actions.set(clip.name, action);
      }

      this.scene.add(root);
      this.callbacks.onLoaded?.();
    } catch (err) {
      this.callbacks.onError?.(
        err instanceof Error ? `Ошибка загрузки модели: ${err.message}` : 'Ошибка загрузки модели Baby Noob',
      );
    }
  }

  private createTorsoBadgeTexture(): Promise<THREE.CanvasTexture | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = 512;
        const h = 256;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d')!;
        // Exact Mat_BabyNoob_Torso sRGB blue fill
        ctx.fillStyle = BABY_NOOB_BLUE_HEX;
        ctx.fillRect(0, 0, w, h);
        // Draw badge cleanly inset by 2px so edge clamp pixels are guaranteed pure blue
        ctx.drawImage(img, 2, 2, w - 4, h - 4);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false; // Verified from GLB TEXCOORD_0: corr(v, Y) = -1.000
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 8;
        resolve(tex);
      };
      img.onerror = () => resolve(null);
      img.src = '/textures/roblox_badge.png';
    });
  }

  // --- PUBLIC CONTROLS ---

  public setEmotion(emotion: EmotionId): void {
    this.emotion = emotion;
  }

  public setAnimationMode(mode: AnimationId): void {
    if (this.animationMode === mode) return;
    this.animationMode = mode;

    if (mode === 'live') {
      this.mixer?.stopAllAction();
      this.activeAction = null;
      this.resetBonesToRest();
      return;
    }

    if (this.activeAction) {
      this.activeAction.fadeOut(0.22);
      this.activeAction = null;
    }

    const action = this.actions.get(mode);
    const meta = ANIMATIONS.find((a) => a.id === mode);
    if (action) {
      action.reset();
      if (meta && !meta.loop) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = false;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }
      action.fadeIn(0.22).play();
      this.activeAction = action;
    }
  }

  public setBackground(id: BackgroundId): void {
    this.backgroundId = id;
    this.studioFloor.visible = false;
    this.studioDisc.visible = false;
    this.grassFloor.visible = false;
    this.cloudGroup.visible = false;
    this.nightBokehGroup.visible = false;
    this.shadowFloor.visible = false;

    switch (id) {
      case 'studio':
        this.scene.background = this.bgTextures.studio;
        this.studioFloor.visible = true;
        this.studioDisc.visible = true;
        break;
      case 'roblox_meadow':
        this.scene.background = this.bgTextures.roblox_meadow;
        this.grassFloor.visible = true;
        this.cloudGroup.visible = true;
        break;
      case 'cozy_night':
        this.scene.background = this.bgTextures.cozy_night;
        this.studioDisc.visible = true;
        (this.studioDisc.material as THREE.MeshStandardMaterial).color.setHex(0x28294a);
        this.nightBokehGroup.visible = true;
        break;
      case 'chroma_green':
        this.scene.background = new THREE.Color('#00ff00');
        break;
      case 'chroma_blue':
        this.scene.background = new THREE.Color('#0000ff');
        break;
      case 'clean_white':
        this.scene.background = new THREE.Color('#f8fafc');
        this.shadowFloor.visible = true;
        break;
    }

    if (id === 'studio') {
      (this.studioDisc.material as THREE.MeshStandardMaterial).color.setHex(0xfbf9f4);
    }
  }

  public setLighting(preset: LightingPresetId): void {
    switch (preset) {
      case 'daylight':
        this.hemiLight.color.setHex(0xfffcf5);
        this.hemiLight.groundColor.setHex(0xc7d2e8);
        this.hemiLight.intensity = 0.85;
        this.keyLight.color.setHex(0xfff9ef);
        this.keyLight.intensity = 1.9;
        this.fillLight.color.setHex(0xdbeafe);
        this.fillLight.intensity = 0.78;
        this.rimLight.color.setHex(0xffe6a8);
        this.rimLight.intensity = 0.95;
        this.renderer.toneMappingExposure = 1.06;
        break;
      case 'studio':
        this.hemiLight.color.setHex(0xffffff);
        this.hemiLight.groundColor.setHex(0x94a3b8);
        this.hemiLight.intensity = 0.65;
        this.keyLight.color.setHex(0xffffff);
        this.keyLight.intensity = 2.3;
        this.fillLight.color.setHex(0xe0f2fe);
        this.fillLight.intensity = 0.6;
        this.rimLight.color.setHex(0x93c5fd);
        this.rimLight.intensity = 1.35;
        this.renderer.toneMappingExposure = 1.04;
        break;
      case 'sunset':
        this.hemiLight.color.setHex(0xffedd5);
        this.hemiLight.groundColor.setHex(0x7c3aed);
        this.hemiLight.intensity = 0.75;
        this.keyLight.color.setHex(0xffb570);
        this.keyLight.intensity = 2.15;
        this.fillLight.color.setHex(0xf9a8d4);
        this.fillLight.intensity = 0.65;
        this.rimLight.color.setHex(0xfef08a);
        this.rimLight.intensity = 1.45;
        this.renderer.toneMappingExposure = 1.08;
        break;
      case 'stream':
        this.hemiLight.color.setHex(0xe0e7ff);
        this.hemiLight.groundColor.setHex(0x312e81);
        this.hemiLight.intensity = 0.72;
        this.keyLight.color.setHex(0xfff7ed);
        this.keyLight.intensity = 1.75;
        this.fillLight.color.setHex(0x38bdf8);
        this.fillLight.intensity = 1.15;
        this.rimLight.color.setHex(0xf472b6);
        this.rimLight.intensity = 1.65;
        this.renderer.toneMappingExposure = 1.08;
        break;
    }
  }

  public setCameraPreset(preset: CameraPresetId): void {
    if (preset === 'free') {
      this.cameraGoal = null;
      return;
    }
    const cfg = CAMERA_PRESETS[preset];
    this.cameraGoal = {
      position: new THREE.Vector3(...cfg.pos),
      target: new THREE.Vector3(...cfg.target),
    };
  }

  public setAccessories(state: AccessoriesState): void {
    this.accessoriesState = { ...state };
    this.accessories.applyState(this.accessoriesState);
  }

  public setSettings(settings: TrackingSettings): void {
    this.settings = { ...settings };
  }

  public setDemoSpeech(enabled: boolean): void {
    this.demoSpeech = enabled;
  }

  public setMouseTracking(enabled: boolean): void {
    this.mouseTracking = enabled;
  }

  public triggerHeadpat(): void {
    this.headpatTimer = 1.35;
    this.headpatSquish = 1.0;
    this.spawnHeadpatParticles();
    this.callbacks.onHeadpat?.();
  }

  public captureTransparentPNG(): string {
    const prevBg = this.scene.background;
    const prevStageVisible = this.stageGroup.visible;

    this.scene.background = null;
    this.stageGroup.visible = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.scene.background = prevBg;
    this.stageGroup.visible = prevStageVisible;
    this.renderer.render(this.scene, this.camera);
    return dataUrl;
  }

  // --- INTERNAL INTERACTION ---

  private handleResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
  };

  private handlePointerDown = (e: PointerEvent): void => {
    this.pointerDownPos.set(e.clientX, e.clientY);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (!this.settings.headpatEnabled) return;
    // Ignore orbit drags
    const moved = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (moved > 8) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.characterMeshes, false);
    if (hits.length > 0) {
      this.triggerHeadpat();
    }
  };

  private spawnHeadpatParticles(): void {
    const headBone = this.bones.get('Head');
    const origin = new THREE.Vector3(0, 1.5, 0.15);
    if (headBone) {
      headBone.getWorldPosition(origin);
      origin.y += 0.72;
      origin.z += 0.12;
    }

    for (let i = 0; i < 8; i++) {
      const isHeart = i % 2 === 0;
      const mat = new THREE.SpriteMaterial({
        map: isHeart ? this.heartTex : this.starTex,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(mat);
      const spreadX = (Math.random() - 0.5) * 0.72;
      const spreadZ = (Math.random() - 0.5) * 0.35;
      sprite.position.set(origin.x + spreadX, origin.y + Math.random() * 0.15, origin.z + spreadZ);
      const scale = 0.14 + Math.random() * 0.12;
      sprite.scale.set(scale, scale, 1);
      this.scene.add(sprite);

      this.particles.push({
        sprite,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.55, 0.75 + Math.random() * 0.6, (Math.random() - 0.5) * 0.25),
        life: 0,
        maxLife: 0.95 + Math.random() * 0.45,
        baseScale: scale,
      });
    }
  }

  private resetBonesToRest(): void {
    for (const [name, bone] of this.bones.entries()) {
      const rest = this.boneRest.get(name);
      if (!rest) continue;
      bone.position.copy(rest.position);
      bone.quaternion.copy(rest.quaternion);
      bone.scale.copy(rest.scale);
    }
  }

  // --- MAIN LOOP ---

  private tick = (now: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.tick);

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    this.elapsed += dt;

    // FPS tracking
    this.fpsFrames++;
    this.fpsAccum += dt;
    if (this.fpsAccum >= 0.5) {
      this.currentFps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsFrames = 0;
      this.fpsAccum = 0;
    }

    // 1. Sample inputs: Webcam, Mic, Demo Speech, Mouse
    const webcamActive = this.webcam.isActive();
    const camPose = webcamActive ? this.webcam.detect(this.settings.mirrorCamera) : null;
    const micSample = this.audio.sample(this.settings.micGain, dt);
    const demoSample = this.demoSpeech ? sampleDemoSpeech(this.elapsed) : null;

    // 2. Compute target head pose, eyes, mouth, brows
    const sens = this.settings.headSensitivity;
    let targetYaw = 0;
    let targetPitch = 0;
    let targetRoll = 0;
    let targetBodyX = 0;
    let targetBodyY = 0;
    let targetGazeX = 0;
    let targetGazeY = 0;
    let targetBlinkL = 0;
    let targetBlinkR = 0;
    let targetMouthOpen = 0;
    let targetMouthSmile = 0.65;
    let targetMouthRound = 0;
    let targetBrowUp = 0;
    let targetBrowDown = 0;
    let faceDetected = false;

    if (camPose && camPose.faceDetected) {
      faceDetected = true;
      targetYaw = clamp(camPose.yaw * 1.15 * sens, -0.78, 0.78);
      targetPitch = clamp(camPose.pitch * 1.05 * sens, -0.48, 0.48);
      targetRoll = clamp(camPose.roll * 1.0 * sens, -0.52, 0.52);
      targetBodyX = clamp(camPose.x * 0.22 * this.settings.bodySway, -0.25, 0.25);
      targetBodyY = clamp(camPose.y * 0.1 * this.settings.bodySway, -0.12, 0.12);
      targetBlinkL = camPose.blinkL;
      targetBlinkR = camPose.blinkR;
      targetGazeX = this.settings.eyeTracking ? camPose.gazeX : 0;
      targetGazeY = this.settings.eyeTracking ? camPose.gazeY : 0;
      targetMouthOpen = camPose.jawOpen;
      targetMouthSmile = camPose.mouthSmile;
      targetMouthRound = camPose.mouthRound;
      targetBrowUp = camPose.browUp;
      targetBrowDown = camPose.browDown;
    } else if (demoSample) {
      targetYaw = demoSample.headYaw * sens;
      targetPitch = demoSample.headNod * sens;
      targetRoll = demoSample.headRoll * sens;
      targetBodyX = Math.sin(this.elapsed * 1.2) * 0.05 * this.settings.bodySway;
      targetGazeX = Math.sin(this.elapsed * 0.9) * 0.45;
      targetGazeY = Math.sin(this.elapsed * 1.3) * 0.15;
    } else if (this.mouseTracking) {
      targetYaw = clamp(this.pointerNdc.x * 0.52 * sens, -0.72, 0.72);
      targetPitch = clamp(-this.pointerNdc.y * 0.34 * sens, -0.42, 0.42);
      targetRoll = clamp(-this.pointerNdc.x * 0.14 * sens, -0.25, 0.25);
      targetBodyX = clamp(this.pointerNdc.x * 0.08 * this.settings.bodySway, -0.12, 0.12);
      if (this.settings.eyeTracking) {
        targetGazeX = clamp(this.pointerNdc.x * 0.85, -1, 1);
        targetGazeY = clamp(-this.pointerNdc.y * 0.75, -1, 1);
      }
    }

    // Mic or Demo Speech lip-sync takes priority / blends cleanly with webcam jawOpen
    const isLipSyncActive = this.audio.isActive() || this.demoSpeech || (webcamActive && faceDetected);
    if (this.audio.isActive()) {
      targetMouthOpen = Math.max(targetMouthOpen, micSample.mouthOpen);
      if (micSample.isTalking) {
        targetMouthRound = Math.max(targetMouthRound * 0.5, micSample.mouthRound);
      }
    }
    if (demoSample) {
      targetMouthOpen = Math.max(targetMouthOpen, demoSample.mouthOpen);
      targetMouthRound = demoSample.mouthRound;
    }

    // Natural auto-blink when webcam is NOT providing real blinks
    const autoBlinkVal = this.updateAutoBlink(dt);
    if (!(webcamActive && faceDetected)) {
      targetBlinkL = autoBlinkVal;
      targetBlinkR = autoBlinkVal;
    }

    // Headpat timer overrides eyes into happy squint + rosy blush + elastic squish!
    if (this.headpatTimer > 0) {
      this.headpatTimer = Math.max(0, this.headpatTimer - dt);
      const patFade = Math.min(1, this.headpatTimer * 2.5);
      targetBlinkL = Math.max(targetBlinkL, patFade);
      targetBlinkR = Math.max(targetBlinkR, patFade);
    }
    this.headpatSquish = damp(this.headpatSquish, 0, 7.5, dt);

    // 3. Smooth damping (user-controlled smoothing slider: higher = smoother/softer)
    const poseLambda = THREE.MathUtils.lerp(22, 4.5, clamp(this.settings.smoothing, 0.05, 0.95));
    this.curYaw = damp(this.curYaw, targetYaw, poseLambda, dt);
    this.curPitch = damp(this.curPitch, targetPitch, poseLambda, dt);
    this.curRoll = damp(this.curRoll, targetRoll, poseLambda, dt);
    this.curBodyX = damp(this.curBodyX, targetBodyX, poseLambda * 0.65, dt);
    this.curBodyY = damp(this.curBodyY, targetBodyY, poseLambda * 0.65, dt);
    this.curGazeX = damp(this.curGazeX, targetGazeX, 16, dt);
    this.curGazeY = damp(this.curGazeY, targetGazeY, 16, dt);
    this.curBlinkL = damp(this.curBlinkL, targetBlinkL, 28, dt);
    this.curBlinkR = damp(this.curBlinkR, targetBlinkR, 28, dt);
    this.curMouthOpen = damp(this.curMouthOpen, targetMouthOpen, 24, dt);
    this.curMouthSmile = damp(this.curMouthSmile, targetMouthSmile, 12, dt);
    this.curMouthRound = damp(this.curMouthRound, targetMouthRound, 16, dt);
    this.curBrowUp = damp(this.curBrowUp, targetBrowUp, 14, dt);
    this.curBrowDown = damp(this.curBrowDown, targetBrowDown, 14, dt);

    const rawAudio = this.audio.isActive()
      ? micSample.audioLevel
      : demoSample
        ? demoSample.audioLevel
        : targetMouthOpen * 0.6;
    this.curAudioLevel = damp(this.curAudioLevel, rawAudio, 16, dt);
    const isTalking = this.curMouthOpen > 0.14 || micSample.isTalking || Boolean(demoSample?.isTalking);

    // 4. Update Live Face Texture on Baby_Head
    const patBlush = this.headpatTimer > 0 ? Math.min(1, this.headpatTimer * 1.4) : 0;
    const blushIntensity = clamp((this.accessoriesState.blushAlways ? 0.85 : 0) + patBlush, 0, 1);

    this.faceEngine.render({
      emotion: this.emotion,
      blinkL: this.curBlinkL,
      blinkR: this.curBlinkR,
      gazeX: this.curGazeX,
      gazeY: this.curGazeY,
      mouthOpen: this.curMouthOpen,
      mouthSmile: this.curMouthSmile,
      mouthRound: this.curMouthRound,
      browUp: this.curBrowUp,
      browDown: this.curBrowDown,
      blushIntensity,
      isLipSyncActive,
      time: this.elapsed,
    });

    // 5. Update Rig: Either Blender AnimationClip OR Live Procedural VTuber Rig
    if (this.animationMode !== 'live' && this.mixer) {
      this.mixer.update(dt);
    } else if (this.bones.size > 0) {
      this.applyProceduralVTuberRig(isTalking);
    }

    // 6. Update Accessories, Stage Ambient Motion, Headpat Particles & Camera
    this.accessories.update(this.elapsed, isTalking);
    this.updateStageAmbience(dt);
    this.updateParticles(dt);

    if (this.cameraGoal) {
      this.camera.position.lerp(this.cameraGoal.position, 1 - Math.exp(-6.5 * dt));
      this.controls.target.lerp(this.cameraGoal.target, 1 - Math.exp(-6.5 * dt));
      if (
        this.camera.position.distanceTo(this.cameraGoal.position) < 0.004 &&
        this.controls.target.distanceTo(this.cameraGoal.target) < 0.004
      ) {
        this.camera.position.copy(this.cameraGoal.position);
        this.controls.target.copy(this.cameraGoal.target);
        this.cameraGoal = null;
      }
    }
    this.controls.update();

    // 7. Render frame
    this.renderer.render(this.scene, this.camera);

    // 8. Push throttled telemetry (~15Hz) to React UI
    this.telemetryTimer += dt;
    if (this.telemetryTimer >= 0.066) {
      this.telemetryTimer = 0;
      const spectrum = this.audio.isActive()
        ? micSample.spectrum
        : demoSample
          ? demoSample.spectrum
          : new Array<number>(16).fill(0);

      this.callbacks.onTelemetry?.({
        yawDeg: Math.round(THREE.MathUtils.radToDeg(this.curYaw)),
        pitchDeg: Math.round(THREE.MathUtils.radToDeg(this.curPitch)),
        rollDeg: Math.round(THREE.MathUtils.radToDeg(this.curRoll)),
        blinkL: this.curBlinkL,
        blinkR: this.curBlinkR,
        mouthOpen: this.curMouthOpen,
        audioLevel: this.curAudioLevel,
        isTalking,
        faceDetected,
        fps: this.currentFps,
        spectrum,
      });
    }
  };

  private updateAutoBlink(dt: number): number {
    if (!this.settings.autoBlink) {
      this.blinkPhase = -1;
      return 0;
    }

    if (this.blinkPhase < 0) {
      if (this.elapsed >= this.nextBlinkAt) {
        this.blinkPhase = 0;
        this.blinkDuration = 0.14 + Math.random() * 0.05;
        this.doubleBlinkQueued = Math.random() < 0.18;
      }
      return 0;
    }

    this.blinkPhase += dt / this.blinkDuration;
    if (this.blinkPhase >= 1) {
      this.blinkPhase = -1;
      if (this.doubleBlinkQueued) {
        this.doubleBlinkQueued = false;
        this.nextBlinkAt = this.elapsed + 0.11;
      } else {
        this.nextBlinkAt = this.elapsed + 2.3 + Math.random() * 3.1;
      }
      return 0;
    }

    return Math.sin(this.blinkPhase * Math.PI);
  }

  private applyProceduralVTuberRig(isTalking: boolean): void {
    const t = this.elapsed;
    const bounce = this.settings.bouncePhysics;
    const sway = this.settings.bodySway;

    // Gentle organic breathing + voice-reactive bounce + emotion body modifiers
    const breathe = Math.sin(t * 2.35);
    const voiceBounce = isTalking ? Math.abs(Math.sin(t * 14.5)) * this.curAudioLevel * 0.032 * bounce : 0;

    let emoHop = 0;
    let emoArmRaise = 0;
    let emoHeadTilt = 0;
    let emoHeadNod = 0;
    let emoJitter = 0;

    switch (this.emotion) {
      case 'surprised':
        emoHop = 0.035 * bounce;
        emoArmRaise = 0.72;
        emoHeadNod = -0.09;
        break;
      case 'hype':
        emoHop = Math.abs(Math.sin(t * 7.2)) * 0.065 * bounce;
        emoArmRaise = 0.85 + Math.sin(t * 14.4) * 0.18;
        emoHeadTilt = Math.sin(t * 7.2) * 0.12;
        break;
      case 'blush':
        emoHeadTilt = 0.14;
        emoArmRaise = -0.18;
        break;
      case 'wink':
        emoHeadTilt = -0.13;
        emoArmRaise = 0.18;
        break;
      case 'angry':
        emoHeadNod = 0.1;
        emoArmRaise = 0.22;
        emoJitter = Math.sin(t * 32) * 0.018 * bounce;
        break;
      case 'sleepy':
        emoHeadNod = 0.12 + Math.sin(t * 1.4) * 0.05;
        emoHeadTilt = Math.sin(t * 1.1) * 0.11;
        emoArmRaise = -0.12;
        break;
      case 'cry':
        emoHeadNod = 0.08;
        emoJitter = Math.sin(t * 22) * 0.012 * bounce;
        emoArmRaise = -0.14;
        break;
      default:
        break;
    }

    // Headpat elastic squash-and-stretch!
    const squishWave = Math.sin(this.headpatSquish * Math.PI * 2.5) * this.headpatSquish * 0.14 * bounce;

    // 1. Root: kept planted cleanly
    const rootBone = this.bones.get('Root');
    const rootRest = this.boneRest.get('Root');
    if (rootBone && rootRest) {
      rootBone.position.copy(rootRest.position);
      rootBone.quaternion.copy(rootRest.quaternion);
      rootBone.scale.copy(rootRest.scale);
    }

    // 2. Pelvis: subtle breathing bob, voice bounce, side shift & squash-and-stretch
    const pelvis = this.bones.get('Pelvis');
    const pelvisRest = this.boneRest.get('Pelvis');
    if (pelvis && pelvisRest) {
      const bobY = (breathe * 0.012 + voiceBounce + emoHop - Math.max(0, squishWave) * 0.12) * Math.max(0.25, bounce);
      pelvis.position.set(
        pelvisRest.position.x + this.curBodyX * 0.6 + emoJitter,
        pelvisRest.position.y + bobY + this.curBodyY * 0.35,
        pelvisRest.position.z,
      );
      this.tmpEuler.set(
        this.curPitch * 0.12 * sway,
        this.curYaw * 0.2 * sway + Math.sin(t * 1.35) * 0.025,
        this.curRoll * 0.18 * sway + Math.sin(t * 1.6) * 0.02,
      );
      pelvis.quaternion.copy(pelvisRest.quaternion).multiply(this.tmpQuat.setFromEuler(this.tmpEuler));
      const sx = 1 + squishWave * 0.45 - voiceBounce * 0.7;
      const sy = 1 - squishWave * 0.55 + voiceBounce * 1.2;
      pelvis.scale.set(pelvisRest.scale.x * sx, pelvisRest.scale.y * sy, pelvisRest.scale.z * sx);
    }

    // 3. Torso: natural secondary follow behind head + breathing expansion
    const torso = this.bones.get('Torso');
    const torsoRest = this.boneRest.get('Torso');
    if (torso && torsoRest) {
      this.tmpEuler.set(
        this.curPitch * 0.28 * sway + breathe * 0.025,
        this.curYaw * 0.32 * sway,
        this.curRoll * 0.32 * sway + emoHeadTilt * 0.25,
      );
      torso.position.copy(torsoRest.position);
      torso.quaternion.copy(torsoRest.quaternion).multiply(this.tmpQuat.setFromEuler(this.tmpEuler));
      torso.scale.set(
        torsoRest.scale.x * (1 + breathe * 0.012),
        torsoRest.scale.y * (1 + breathe * 0.016),
        torsoRest.scale.z * (1 + breathe * 0.012),
      );
    }

    // 4. Head: primary VTuber tracking bone (yaw, pitch, roll + voice nod + headpat bounce!)
    const head = this.bones.get('Head');
    const headRest = this.boneRest.get('Head');
    if (head && headRest) {
      const talkNod = isTalking ? Math.sin(t * 12) * this.curAudioLevel * 0.045 * bounce : 0;
      this.tmpEuler.set(
        this.curPitch * 0.74 + emoHeadNod + talkNod + Math.sin(t * 1.7) * 0.018,
        this.curYaw * 0.76,
        this.curRoll * 0.74 + emoHeadTilt,
      );
      head.position.copy(headRest.position);
      head.quaternion.copy(headRest.quaternion).multiply(this.tmpQuat.setFromEuler(this.tmpEuler));
      const hScaleX = 1 + squishWave * 0.65;
      const hScaleY = 1 - squishWave * 0.72;
      head.scale.set(headRest.scale.x * hScaleX, headRest.scale.y * hScaleY, headRest.scale.z * hScaleX);
    }

    // 5. Arms (Arm.L at +X, Arm.R at -X): lively organic idle swing + voice & emotion gestures!
    const armL = this.bones.get('Arm.L');
    const armLRest = this.boneRest.get('Arm.L');
    if (armL && armLRest) {
      const idleSwing = Math.sin(t * 2.35 + 0.4) * 0.08 * bounce;
      const talkGest = isTalking ? Math.sin(t * 9.5) * this.curAudioLevel * 0.22 * bounce : 0;
      const raise = (emoArmRaise + talkGest + Math.max(0, squishWave) * 0.9) * Math.max(0.35, bounce);
      // Arm.L local rest is rotated ~-150deg around Z; rotating around local Z lifts/lowers arm cleanly
      this.tmpEuler.set(
        idleSwing + this.curPitch * 0.14,
        0,
        raise + idleSwing * 0.6 - this.curRoll * 0.2,
      );
      armL.position.copy(armLRest.position);
      armL.quaternion.copy(armLRest.quaternion).multiply(this.tmpQuat.setFromEuler(this.tmpEuler));
      armL.scale.copy(armLRest.scale);
    }

    const armR = this.bones.get('Arm.R');
    const armRRest = this.boneRest.get('Arm.R');
    if (armR && armRRest) {
      const idleSwing = Math.sin(t * 2.35 + Math.PI + 0.4) * 0.08 * bounce;
      const talkGest = isTalking ? Math.sin(t * 9.5 + 1.1) * this.curAudioLevel * 0.22 * bounce : 0;
      const raise = (emoArmRaise + talkGest + Math.max(0, squishWave) * 0.9) * Math.max(0.35, bounce);
      this.tmpEuler.set(
        idleSwing + this.curPitch * 0.14,
        0,
        -(raise + idleSwing * 0.6) - this.curRoll * 0.2,
      );
      armR.position.copy(armRRest.position);
      armR.quaternion.copy(armRRest.quaternion).multiply(this.tmpQuat.setFromEuler(this.tmpEuler));
      armR.scale.copy(armRRest.scale);
    }

    // 6. Legs: grounded with cute counter-sway when hopping
    for (const side of ['Leg.L', 'Leg.R'] as const) {
      const leg = this.bones.get(side);
      const rest = this.boneRest.get(side);
      if (!leg || !rest) continue;
      const sign = side === 'Leg.L' ? 1 : -1;
      const kick = emoHop > 0.02 ? Math.sin(t * 7.2 + (sign > 0 ? 0 : Math.PI)) * 0.16 : 0;
      this.tmpEuler.set(kick, 0, -this.curRoll * 0.12 * sway);
      leg.position.copy(rest.position);
      leg.quaternion.copy(rest.quaternion).multiply(this.tmpQuat.setFromEuler(this.tmpEuler));
      leg.scale.copy(rest.scale);
    }
  }

  private updateStageAmbience(dt: number): void {
    if (this.cloudGroup.visible) {
      for (const child of this.cloudGroup.children) {
        child.position.x += dt * 0.12;
        if (child.position.x > 8.5) child.position.x = -8.5;
      }
    }

    if (this.nightBokehGroup.visible) {
      for (const child of this.nightBokehGroup.children) {
        const { baseY, speed, phase } = child.userData as { baseY: number; speed: number; phase: number };
        child.position.y = baseY + Math.sin(this.elapsed * speed + phase) * 0.14;
      }
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      const progress = p.life / p.maxLife;
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.velocity.y -= dt * 0.35;
      const pop = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) * 0.55;
      const s = p.baseScale * Math.max(0.01, pop);
      p.sprite.scale.set(s, s, 1);
      p.sprite.material.opacity = progress < 0.65 ? 1 : 1 - (progress - 0.65) / 0.35;
    }
  }

  public getBackgroundId(): BackgroundId {
    return this.backgroundId;
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp);

    this.webcam.dispose();
    this.audio.stop();
    this.faceEngine.dispose();
    this.controls.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }

    // Silence unused private reference warning if characterRoot unused outside load
    void this.characterRoot;
    void this.tmpVec;
  }
}
