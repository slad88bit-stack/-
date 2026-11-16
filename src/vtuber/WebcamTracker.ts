import * as THREE from 'three';
import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import type { RawWebcamPose } from '../types/vtuber';

const MODEL_ASSET_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Key face contour landmark indices for lightweight crisp PiP preview overlay
const FACE_OVAL_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];
const LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144, 33];
const RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380, 362];
const LIPS_IDX = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];

const EMPTY_POSE: RawWebcamPose = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  x: 0,
  y: 0,
  blinkL: 0,
  blinkR: 0,
  gazeX: 0,
  gazeY: 0,
  jawOpen: 0,
  mouthSmile: 0,
  mouthRound: 0,
  browUp: 0,
  browDown: 0,
  faceDetected: false,
};

export class WebcamTracker {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private active = false;
  private lastVideoTime = -1;
  private latestPose: RawWebcamPose = { ...EMPTY_POSE };

  // Calibration neutral offset
  private calibrated = false;
  private calYaw = 0;
  private calPitch = 0;
  private calRoll = 0;
  private calX = 0;
  private calY = 0;
  private rawYaw = 0;
  private rawPitch = 0;
  private rawRoll = 0;
  private rawX = 0;
  private rawY = 0;

  private readonly mat4 = new THREE.Matrix4();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');

  public setPreviewCanvas(canvas: HTMLCanvasElement | null): void {
    this.previewCanvas = canvas;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  public isActive(): boolean {
    return this.active;
  }

  public calibrate(): void {
    this.calYaw = this.rawYaw;
    this.calPitch = this.rawPitch;
    this.calRoll = this.rawRoll;
    this.calX = this.rawX;
    this.calY = this.rawY;
    this.calibrated = true;
  }

  public async start(): Promise<void> {
    if (this.active) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Браузер не поддерживает веб-камеру (нужен HTTPS)');
    }

    // 1. Request webcam stream first so permission dialog shows immediately
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: 'user',
      },
      audio: false,
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    video.playsInline = true;
    video.muted = true;
    await video.play();

    // 2. Initialize MediaPipe FaceLandmarker using local same-origin WASM
    try {
      if (!this.landmarker) {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.45,
          minFacePresenceConfidence: 0.45,
          minTrackingConfidence: 0.45,
        });
      }
    } catch {
      // Retry on CPU delegate if WebGL delegate fails on some devices
      try {
        const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
        this.landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_ASSET_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(
          err instanceof Error
            ? `Не удалось загрузить модель трекинга лица: ${err.message}`
            : 'Не удалось загрузить модель трекинга лица',
        );
      }
    }

    this.stream = stream;
    this.video = video;
    this.lastVideoTime = -1;
    this.calibrated = false;
    this.active = true;
  }

  public stop(): void {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }
    this.latestPose = { ...EMPTY_POSE };
    if (this.previewCanvas) {
      const ctx = this.previewCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }
  }

  public detect(mirror: boolean): RawWebcamPose {
    if (!this.active || !this.landmarker || !this.video || this.video.readyState < 2) {
      return this.latestPose;
    }

    const nowMs = performance.now();
    if (this.video.currentTime === this.lastVideoTime) {
      return this.latestPose;
    }
    this.lastVideoTime = this.video.currentTime;

    let result: FaceLandmarkerResult;
    try {
      result = this.landmarker.detectForVideo(this.video, nowMs);
    } catch {
      return this.latestPose;
    }

    this.drawPreview(result, mirror);

    const hasFace = Boolean(result.faceLandmarks && result.faceLandmarks.length > 0);
    if (!hasFace) {
      this.latestPose = { ...this.latestPose, faceDetected: false };
      return this.latestPose;
    }

    // 1. Head rotation & translation from 4x4 Facial Transformation Matrix
    if (result.facialTransformationMatrixes && result.facialTransformationMatrixes.length > 0) {
      const mData = result.facialTransformationMatrixes[0].data;
      this.mat4.fromArray(mData);
      this.euler.setFromRotationMatrix(this.mat4, 'YXZ');

      // MediaPipe right-handed camera coordinates -> natural head Euler angles
      this.rawYaw = this.euler.y;
      this.rawPitch = -this.euler.x;
      this.rawRoll = this.euler.z;
    }

    // Nose tip landmark (#1) gives smooth normalized head position
    const nose = result.faceLandmarks[0][1];
    if (nose) {
      this.rawX = (nose.x - 0.5) * 2;
      this.rawY = (nose.y - 0.5) * 2;
    }

    // Auto-calibrate on first clean detection
    if (!this.calibrated) {
      this.calibrate();
    }

    const mirrorSign = mirror ? -1 : 1;
    const yaw = (this.rawYaw - this.calYaw) * mirrorSign;
    const pitch = this.rawPitch - this.calPitch;
    const roll = (this.rawRoll - this.calRoll) * mirrorSign;
    const x = (this.rawX - this.calX) * mirrorSign;
    const y = -(this.rawY - this.calY);

    // 2. ARKit Blendshapes
    const bs = new Map<string, number>();
    const cats = result.faceBlendshapes?.[0]?.categories;
    if (cats) {
      for (const c of cats) {
        bs.set(c.categoryName, c.score);
      }
    }

    const get = (name: string) => bs.get(name) ?? 0;

    // Remap blink with clean sensitivity curve so natural blinks close fully
    const remapBlink = (v: number) => Math.max(0, Math.min(1, (v - 0.14) / 0.44));
    const mpBlinkL = remapBlink(get('eyeBlinkLeft'));
    const mpBlinkR = remapBlink(get('eyeBlinkRight'));
    // In viewer coords: mirror mode puts user's left eye on viewer's right (canvas right)
    const blinkL = mirror ? mpBlinkR : mpBlinkL;
    const blinkR = mirror ? mpBlinkL : mpBlinkR;

    const lookRight = (get('eyeLookOutRight') + get('eyeLookInLeft')) * 0.5;
    const lookLeft = (get('eyeLookOutLeft') + get('eyeLookInRight')) * 0.5;
    const lookUp = (get('eyeLookUpLeft') + get('eyeLookUpRight')) * 0.5;
    const lookDown = (get('eyeLookDownLeft') + get('eyeLookDownRight')) * 0.5;
    const gazeX = (lookRight - lookLeft) * 1.8 * (mirror ? -1 : 1);
    const gazeY = (lookDown - lookUp) * 1.8;

    const jawOpen = Math.max(0, Math.min(1, (get('jawOpen') - 0.04) * 1.55));
    const smile = (get('mouthSmileLeft') + get('mouthSmileRight')) * 0.5;
    const frown = (get('mouthFrownLeft') + get('mouthFrownRight')) * 0.5;
    const mouthSmile = Math.max(-1, Math.min(1, (smile - frown) * 1.6));
    const mouthRound = Math.max(0, Math.min(1, (get('mouthPucker') + get('mouthFunnel')) * 0.95));

    const browUp = Math.min(1, get('browInnerUp') * 1.35);
    const browDown = Math.min(1, ((get('browDownLeft') + get('browDownRight')) * 0.5) * 1.45);

    this.latestPose = {
      yaw,
      pitch,
      roll,
      x,
      y,
      blinkL,
      blinkR,
      gazeX,
      gazeY,
      jawOpen,
      mouthSmile,
      mouthRound,
      browUp,
      browDown,
      faceDetected: true,
    };

    return this.latestPose;
  }

  private drawPreview(result: FaceLandmarkerResult, mirror: boolean): void {
    const canvas = this.previewCanvas;
    const video = this.video;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, w, h);

    const lm = result.faceLandmarks?.[0];
    if (lm && lm.length > 400) {
      const strokeLoop = (indices: number[], color: string, width: number) => {
        ctx.beginPath();
        indices.forEach((idx, i) => {
          const p = lm[idx];
          if (!p) return;
          const px = p.x * w;
          const py = p.y * h;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };

      strokeLoop(FACE_OVAL_IDX, 'rgba(56, 189, 248, 0.85)', 1.6);
      strokeLoop(LEFT_EYE_IDX, 'rgba(250, 204, 21, 0.95)', 1.8);
      strokeLoop(RIGHT_EYE_IDX, 'rgba(250, 204, 21, 0.95)', 1.8);
      strokeLoop(LIPS_IDX, 'rgba(244, 63, 94, 0.95)', 1.8);
    }

    ctx.restore();
  }

  public dispose(): void {
    this.stop();
    if (this.landmarker) {
      this.landmarker.close();
      this.landmarker = null;
    }
  }
}
