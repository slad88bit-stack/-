import * as THREE from 'three';
import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type FaceLandmarkerResult,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { ArmDirection3D, RawWebcamPose } from '../types/vtuber';

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const FACE_OVAL_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
  148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
];
const LEFT_EYE_IDX = [33, 160, 158, 133, 153, 144, 33];
const RIGHT_EYE_IDX = [362, 385, 387, 263, 373, 380, 362];
const LIPS_OUTER_IDX = [
  61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61,
];
const LIPS_INNER_IDX = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78];

const HAND_BONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const REST_ARM_L: ArmDirection3D = { x: 0.5, y: -0.866, z: 0, detected: false, confidence: 0 };
const REST_ARM_R: ArmDirection3D = { x: -0.5, y: -0.866, z: 0, detected: false, confidence: 0 };

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
  mouthWidth: 1,
  mouthRound: 0,
  mouthShiftX: 0,
  mouthSkew: 0,
  browUp: 0,
  browDown: 0,
  faceDetected: false,
  armL: { ...REST_ARM_L },
  armR: { ...REST_ARM_R },
  shoulderRoll: 0,
  poseReady: false,
  poseDetected: false,
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function dist2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function normalizeArm(dx: number, dy: number, dz: number, confidence: number): ArmDirection3D {
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) {
    return { x: 0, y: -1, z: 0, detected: false, confidence: 0 };
  }
  return {
    x: dx / len,
    y: dy / len,
    z: dz / len,
    detected: true,
    confidence,
  };
}

export class WebcamTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private auxLoadStarted = false;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private active = false;
  private lastVideoTime = -1;
  private lastFaceTs = 0;
  private lastPoseTs = 0;
  private lastHandTs = 0;
  private latestPose: RawWebcamPose = {
    ...EMPTY_POSE,
    armL: { ...REST_ARM_L },
    armR: { ...REST_ARM_R },
  };

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

  private async createFaceLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  ): Promise<FaceLandmarker> {
    try {
      return await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.42,
        minFacePresenceConfidence: 0.42,
        minTrackingConfidence: 0.42,
      });
    } catch {
      return await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });
    }
  }

  private async createPoseLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  ): Promise<PoseLandmarker | null> {
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
      } catch (err) {
        console.warn(`[VTuber] PoseLandmarker (${delegate}) init failed:`, err);
      }
    }
    return null;
  }

  private async createHandLandmarker(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  ): Promise<HandLandmarker | null> {
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });
      } catch (err) {
        console.warn(`[VTuber] HandLandmarker (${delegate}) init failed:`, err);
      }
    }
    return null;
  }

  // IMPORTANT: @mediapipe/tasks-vision uses global self.ModuleFactory during creation,
  // so FaceLandmarker, PoseLandmarker and HandLandmarker MUST be initialized strictly sequentially!
  private async loadAuxTrackersSequentially(
    vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  ): Promise<void> {
    if (this.auxLoadStarted) return;
    this.auxLoadStarted = true;
    try {
      if (!this.poseLandmarker) {
        this.poseLandmarker = await this.createPoseLandmarker(vision);
      }
      if (!this.handLandmarker) {
        this.handLandmarker = await this.createHandLandmarker(vision);
      }
    } finally {
      this.auxLoadStarted = false;
    }
  }

  public async start(): Promise<void> {
    if (this.active) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Браузер не поддерживает веб-камеру (нужен HTTPS)');
    }

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

    let vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
    try {
      vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      if (!this.faceLandmarker) {
        this.faceLandmarker = await this.createFaceLandmarker(vision);
      }
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        err instanceof Error
          ? `Не удалось загрузить модели трекинга: ${err.message}`
          : 'Не удалось загрузить модели трекинга',
      );
    }

    this.stream = stream;
    this.video = video;
    this.lastVideoTime = -1;
    this.calibrated = false;
    this.active = true;

    // Load Pose + Hand trackers strictly AFTER FaceLandmarker has finished touching self.ModuleFactory!
    void this.loadAuxTrackersSequentially(vision);
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
    this.latestPose = {
      ...EMPTY_POSE,
      armL: { ...REST_ARM_L },
      armR: { ...REST_ARM_R },
      poseReady: Boolean(this.poseLandmarker || this.handLandmarker),
    };
    if (this.previewCanvas) {
      const ctx = this.previewCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    }
  }

  public detect(mirror: boolean, trackArms = true): RawWebcamPose {
    if (!this.active || !this.faceLandmarker || !this.video || this.video.readyState < 2) {
      return this.latestPose;
    }

    if (this.video.currentTime === this.lastVideoTime) {
      return this.latestPose;
    }
    this.lastVideoTime = this.video.currentTime;

    const nowMs = Math.max(performance.now(), this.lastFaceTs + 1);
    this.lastFaceTs = nowMs;

    let faceResult: FaceLandmarkerResult | null = null;
    try {
      faceResult = this.faceLandmarker.detectForVideo(this.video, nowMs);
    } catch {
      return this.latestPose;
    }

    let poseResult: PoseLandmarkerResult | null = null;
    if (trackArms && this.poseLandmarker) {
      const poseTs = Math.max(nowMs, this.lastPoseTs + 1);
      this.lastPoseTs = poseTs;
      try {
        poseResult = this.poseLandmarker.detectForVideo(this.video, poseTs);
      } catch {
        poseResult = null;
      }
    }

    let handResult: HandLandmarkerResult | null = null;
    if (trackArms && this.handLandmarker) {
      const handTs = Math.max(nowMs, this.lastHandTs + 1);
      this.lastHandTs = handTs;
      try {
        handResult = this.handLandmarker.detectForVideo(this.video, handTs);
      } catch {
        handResult = null;
      }
    }

    this.drawPreview(faceResult, poseResult, handResult, mirror);

    // 1. Parse Face (Head pose, Eyes, Full Mouth articulation)
    const lm = faceResult.faceLandmarks?.[0];
    const hasFace = Boolean(lm && lm.length > 400);

    let yaw = this.latestPose.yaw;
    let pitch = this.latestPose.pitch;
    let roll = this.latestPose.roll;
    let x = this.latestPose.x;
    let y = this.latestPose.y;
    let blinkL = this.latestPose.blinkL;
    let blinkR = this.latestPose.blinkR;
    let gazeX = this.latestPose.gazeX;
    let gazeY = this.latestPose.gazeY;
    let jawOpen = this.latestPose.jawOpen;
    let mouthSmile = this.latestPose.mouthSmile;
    let mouthWidth = this.latestPose.mouthWidth;
    let mouthRound = this.latestPose.mouthRound;
    let mouthShiftX = this.latestPose.mouthShiftX;
    let mouthSkew = this.latestPose.mouthSkew;
    let browUp = this.latestPose.browUp;
    let browDown = this.latestPose.browDown;

    // Face bounding reference for close-up shoulder estimation when Pose shoulders are below frame
    let faceCenterX = 0.5;
    let faceChinY = 0.58;
    let faceW = 0.22;
    let faceH = 0.30;

    if (hasFace && lm) {
      if (faceResult.facialTransformationMatrixes && faceResult.facialTransformationMatrixes.length > 0) {
        this.mat4.fromArray(faceResult.facialTransformationMatrixes[0].data);
        this.euler.setFromRotationMatrix(this.mat4, 'YXZ');
        this.rawYaw = this.euler.y;
        this.rawPitch = -this.euler.x;
        this.rawRoll = this.euler.z;
      }

      const nose = lm[1];
      if (nose) {
        this.rawX = (nose.x - 0.5) * 2;
        this.rawY = (nose.y - 0.5) * 2;
      }

      if (!this.calibrated) {
        this.calibrate();
      }

      const mirrorSign = mirror ? -1 : 1;
      yaw = (this.rawYaw - this.calYaw) * mirrorSign;
      pitch = this.rawPitch - this.calPitch;
      roll = (this.rawRoll - this.calRoll) * mirrorSign;
      x = (this.rawX - this.calX) * mirrorSign;
      y = -(this.rawY - this.calY);

      const bs = new Map<string, number>();
      const cats = faceResult.faceBlendshapes?.[0]?.categories;
      if (cats) {
        for (const c of cats) bs.set(c.categoryName, c.score);
      }
      const get = (name: string) => bs.get(name) ?? 0;

      // Eyes & Blink
      const remapBlink = (v: number) => clamp((v - 0.14) / 0.44, 0, 1);
      const mpBlinkL = remapBlink(get('eyeBlinkLeft'));
      const mpBlinkR = remapBlink(get('eyeBlinkRight'));
      blinkL = mirror ? mpBlinkR : mpBlinkL;
      blinkR = mirror ? mpBlinkL : mpBlinkR;

      const lookRight = (get('eyeLookOutRight') + get('eyeLookInLeft')) * 0.5;
      const lookLeft = (get('eyeLookOutLeft') + get('eyeLookInRight')) * 0.5;
      const lookUp = (get('eyeLookUpLeft') + get('eyeLookUpRight')) * 0.5;
      const lookDown = (get('eyeLookDownLeft') + get('eyeLookDownRight')) * 0.5;
      gazeX = (lookRight - lookLeft) * 1.85 * mirrorSign;
      gazeY = (lookDown - lookUp) * 1.85;

      // === FULL MOUTH TRACKING (ARKit Blendshapes + Geometric 3D Lip Landmarks) ===
      const forehead = lm[10];
      const chin = lm[152];
      const cheekL = lm[234];
      const cheekR = lm[454];
      const upperInnerLip = lm[13];
      const lowerInnerLip = lm[14];
      const cornerLeft = lm[61];
      const cornerRight = lm[291];

      faceH = Math.max(0.05, dist2D(forehead, chin));
      faceW = Math.max(0.05, dist2D(cheekL, cheekR));
      faceCenterX = (cheekL.x + cheekR.x) * 0.5;
      faceChinY = chin.y;

      const lipGap = dist2D(upperInnerLip, lowerInnerLip) / faceH;
      const geoOpen = clamp((lipGap - 0.012) / 0.14, 0, 1);
      const bsOpen = clamp((get('jawOpen') - 0.025) * 1.65, 0, 1);
      const mouthClose = get('mouthClose');
      jawOpen = clamp(Math.max(bsOpen, geoOpen * 0.98) * (1 - mouthClose * 0.55), 0, 1);

      const pucker = get('mouthPucker');
      const funnel = get('mouthFunnel');
      const smileL = get('mouthSmileLeft');
      const smileR = get('mouthSmileRight');
      const frownL = get('mouthFrownLeft');
      const frownR = get('mouthFrownRight');
      const stretch = (get('mouthStretchLeft') + get('mouthStretchRight')) * 0.5;

      const geoWidthRatio = dist2D(cornerLeft, cornerRight) / faceH;
      const geoWidthNorm = clamp(geoWidthRatio / 0.31, 0.55, 1.35);
      const bsWidth = 1.0 + (smileL + smileR) * 0.16 + stretch * 0.25 - pucker * 0.52 - funnel * 0.36;
      mouthWidth = clamp(bsWidth * 0.65 + geoWidthNorm * 0.35, 0.42, 1.35);

      mouthRound = clamp(pucker * 1.15 + funnel * 1.0 + Math.max(0, 0.85 - mouthWidth) * 0.8, 0, 1);

      const lipMidY = (upperInnerLip.y + lowerInnerLip.y) * 0.5;
      const cornerAvgY = (cornerLeft.y + cornerRight.y) * 0.5;
      const geoSmile = clamp(((lipMidY - cornerAvgY) / faceH) * 8.0, -0.7, 0.7);
      const bsSmile = ((smileL + smileR) * 0.5 - (frownL + frownR) * 0.62) * 1.9;
      mouthSmile = clamp(bsSmile * 0.72 + geoSmile * 0.45, -1, 1);

      // Roll-compensated geometric mouth shift & asymmetric smirk
      const eyeL = lm[33];
      const eyeR = lm[263];
      const faceRollAngle = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
      const cosR = Math.cos(-faceRollAngle);
      const sinR = Math.sin(-faceRollAngle);

      const dCornerX = cornerRight.x - cornerLeft.x;
      const dCornerY = cornerRight.y - cornerLeft.y;
      const rotCornerY = dCornerX * sinR + dCornerY * cosR;
      const geoSkew = clamp((rotCornerY / faceH) * 9.5, -1, 1);
      mouthSkew = clamp(geoSkew * (mirror ? 1 : -1), -1, 1);

      const eyeCenterX = (eyeL.x + eyeR.x) * 0.5;
      const mouthCenterX = (cornerLeft.x + cornerRight.x) * 0.5;
      const mouthCenterY = (cornerLeft.y + cornerRight.y) * 0.5;
      const relX = mouthCenterX - eyeCenterX;
      const relY = mouthCenterY - (eyeL.y + eyeR.y) * 0.5;
      const rotShiftX = relX * cosR - relY * sinR;
      const geoShift = clamp((rotShiftX / faceH) * 5.2, -1, 1);
      mouthShiftX = clamp(geoShift * (mirror ? -1 : 1), -1, 1);

      browUp = clamp(get('browInnerUp') * 1.4, 0, 1);
      browDown = clamp(((get('browDownLeft') + get('browDownRight')) * 0.5) * 1.5, 0, 1);
    }

    // 2. Parse Full 3D Arms & Shoulders (Fusing PoseLandmarker + HandLandmarker!)
    let userLeftArm: ArmDirection3D = { x: 0, y: -1, z: 0, detected: false, confidence: 0 };
    let userRightArm: ArmDirection3D = { x: 0, y: -1, z: 0, detected: false, confidence: 0 };
    let shoulderRoll = 0;
    let poseDetected = false;

    const pLm = poseResult?.landmarks?.[0];
    const wLm = poseResult?.worldLandmarks?.[0];
    const videoAspect = (this.video.videoWidth || 640) / Math.max(1, this.video.videoHeight || 480);

    // Shoulder anchors in normalized raw image coords (raw image left = user's RIGHT, raw image right = user's LEFT)
    let userRightShoulder = { x: clamp(faceCenterX - faceW * 1.15, 0.05, 0.9), y: clamp(faceChinY + faceH * 0.42, 0.3, 1.05) };
    let userLeftShoulder = { x: clamp(faceCenterX + faceW * 1.15, 0.1, 0.95), y: clamp(faceChinY + faceH * 0.42, 0.3, 1.05) };

    if (trackArms && pLm && pLm.length >= 21) {
      poseDetected = true;
      const src = wLm && wLm.length >= 21 ? wLm : pLm;

      if ((pLm[11].visibility ?? 0) > 0.25) {
        userLeftShoulder = { x: pLm[11].x, y: pLm[11].y };
      }
      if ((pLm[12].visibility ?? 0) > 0.25) {
        userRightShoulder = { x: pLm[12].x, y: pLm[12].y };
      }

      const buildPoseArm = (
        shoulderIdx: number,
        elbowIdx: number,
        wristIdx: number,
        indexIdx: number,
      ): ArmDirection3D => {
        const sNorm = pLm[shoulderIdx];
        const eNorm = pLm[elbowIdx];
        const wNorm = pLm[wristIdx];
        const iNorm = pLm[indexIdx];

        const sVis = sNorm.visibility ?? 1;
        const eVis = eNorm.visibility ?? 0;
        const wVis = wNorm.visibility ?? 0;

        const elbowInView = eVis > 0.22 && eNorm.y < 1.3 && eNorm.x > -0.3 && eNorm.x < 1.3;
        const wristInView = wVis > 0.24 && wNorm.y < 1.25 && wNorm.x > -0.25 && wNorm.x < 1.25;

        if (sVis < 0.2 || (!elbowInView && !wristInView)) {
          return { x: 0, y: -1, z: 0, detected: false, confidence: 0 };
        }

        const s = src[shoulderIdx];
        const e = src[elbowIdx];
        const w = src[wristIdx];
        const idxFinger = src[indexIdx];

        let vx = 0;
        let vy = 0;
        let vz = 0;

        if (wristInView) {
          const useHand = (iNorm.visibility ?? 0) > 0.28;
          const handX = useHand ? w.x * 0.72 + idxFinger.x * 0.28 : w.x;
          const handY = useHand ? w.y * 0.72 + idxFinger.y * 0.28 : w.y;
          const handZ = useHand ? w.z * 0.72 + idxFinger.z * 0.28 : w.z;

          if (elbowInView) {
            vx = (e.x - s.x) * 0.25 + (handX - s.x) * 0.75;
            vy = (e.y - s.y) * 0.25 + (handY - s.y) * 0.75;
            vz = (e.z - s.z) * 0.25 + (handZ - s.z) * 0.75;
          } else {
            vx = handX - s.x;
            vy = handY - s.y;
            vz = handZ - s.z;
          }
        } else {
          vx = e.x - s.x;
          vy = e.y - s.y;
          vz = e.z - s.z;
        }

        const dx = mirror ? -vx : vx;
        const dy = -vy;
        const dz = clamp(-vz * 0.7, -0.45, 0.92);
        return normalizeArm(dx, dy, dz, wristInView ? wVis : eVis);
      };

      userLeftArm = buildPoseArm(11, 13, 15, 19);
      userRightArm = buildPoseArm(12, 14, 16, 20);

      const shL = pLm[11];
      const shR = pLm[12];
      if ((shL.visibility ?? 0) > 0.35 && (shR.visibility ?? 0) > 0.35) {
        const sdx = shL.x - shR.x;
        const sdy = shL.y - shR.y;
        const rawTilt = Math.atan2(sdy, Math.abs(sdx) + 1e-4);
        shoulderRoll = clamp(rawTilt * (mirror ? 1 : -1), -0.45, 0.45);
      }
    }

    // 3. Fuse HandLandmarker (instant close-up hand & arm tracking even when elbows/torso are below camera!)
    const hands = handResult?.landmarks ?? [];
    if (trackArms && hands.length > 0) {
      poseDetected = true;
      const bodyCenterX = (userRightShoulder.x + userLeftShoulder.x) * 0.5;

      interface HandCandidate {
        hx: number;
        hy: number;
        palmSpan: number;
        side: 'userRight' | 'userLeft';
      }

      const candidates: HandCandidate[] = hands
        .filter((h) => h && h.length >= 21)
        .map((h) => {
          const wrist = h[0];
          const midMcp = h[9];
          const hx = wrist.x * 0.55 + midMcp.x * 0.45;
          const hy = wrist.y * 0.55 + midMcp.y * 0.45;
          const palmSpan = dist2D(wrist, midMcp);

          // Match to Pose wrists first if visible & close; otherwise use raw-image side of body centerline
          // (raw-image left = userRight, raw-image right = userLeft)
          let side: 'userRight' | 'userLeft' = hx < bodyCenterX ? 'userRight' : 'userLeft';
          if (pLm && pLm.length >= 17) {
            const pLeftVis = (pLm[15].visibility ?? 0) > 0.35;
            const pRightVis = (pLm[16].visibility ?? 0) > 0.35;
            const dLeft = pLeftVis ? Math.hypot(hx - pLm[15].x, hy - pLm[15].y) : 99;
            const dRight = pRightVis ? Math.hypot(hx - pLm[16].x, hy - pLm[16].y) : 99;
            if (Math.min(dLeft, dRight) < 0.18) {
              side = dRight <= dLeft ? 'userRight' : 'userLeft';
            }
          }
          return { hx, hy, palmSpan, side };
        });

      // If 2 hands are detected and both landed on the same side, split cleanly by raw-image X
      if (candidates.length >= 2 && candidates[0].side === candidates[1].side) {
        const sorted = [...candidates].sort((a, b) => a.hx - b.hx);
        sorted[0].side = 'userRight';
        sorted[1].side = 'userLeft';
      }

      const buildHandArm = (cand: HandCandidate, shoulder: { x: number; y: number }): ArmDirection3D => {
        const vx = (cand.hx - shoulder.x) * videoAspect;
        const vy = cand.hy - shoulder.y;
        const dx = mirror ? -vx : vx;
        const dy = -vy;
        // Subtle forward Z proportional to hand closeness (larger palm = closer to camera)
        const depthBoost = clamp((cand.palmSpan / Math.max(0.12, faceH) - 0.18) * 0.55, 0.08, 0.34);
        return normalizeArm(dx, dy, depthBoost, 0.95);
      };

      for (const cand of candidates) {
        if (cand.side === 'userRight') {
          const hArm = buildHandArm(cand, userRightShoulder);
          if (userRightArm.detected) {
            userRightArm = normalizeArm(
              userRightArm.x * 0.3 + hArm.x * 0.7,
              userRightArm.y * 0.3 + hArm.y * 0.7,
              userRightArm.z * 0.3 + hArm.z * 0.7,
              0.95,
            );
          } else {
            userRightArm = hArm;
          }
        } else {
          const hArm = buildHandArm(cand, userLeftShoulder);
          if (userLeftArm.detected) {
            userLeftArm = normalizeArm(
              userLeftArm.x * 0.3 + hArm.x * 0.7,
              userLeftArm.y * 0.3 + hArm.y * 0.7,
              userLeftArm.z * 0.3 + hArm.z * 0.7,
              0.95,
            );
          } else {
            userLeftArm = hArm;
          }
        }
      }
    }

    // In mirror (selfie) mode: user's RIGHT arm drives screen-right ArmL (+X), user's LEFT arm drives screen-left ArmR (-X)
    const armL = mirror
      ? userRightArm.detected
        ? userRightArm
        : { ...REST_ARM_L }
      : userLeftArm.detected
        ? userLeftArm
        : { ...REST_ARM_L };

    const armR = mirror
      ? userLeftArm.detected
        ? userLeftArm
        : { ...REST_ARM_R }
      : userRightArm.detected
        ? userRightArm
        : { ...REST_ARM_R };

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
      mouthWidth,
      mouthRound,
      mouthShiftX,
      mouthSkew,
      browUp,
      browDown,
      faceDetected: hasFace,
      armL,
      armR,
      shoulderRoll,
      poseReady: Boolean(this.poseLandmarker || this.handLandmarker),
      poseDetected,
    };

    return this.latestPose;
  }

  private drawPreview(
    faceResult: FaceLandmarkerResult,
    poseResult: PoseLandmarkerResult | null,
    handResult: HandLandmarkerResult | null,
    mirror: boolean,
  ): void {
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

    // 1. Pose Arm & Shoulder skeleton overlay
    const pLm = poseResult?.landmarks?.[0];
    if (pLm && pLm.length >= 17) {
      const drawPoseBone = (aIdx: number, bIdx: number, color: string) => {
        const a = pLm[aIdx];
        const b = pLm[bIdx];
        if ((a.visibility ?? 0) < 0.22 || (b.visibility ?? 0) < 0.22) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      };
      drawPoseBone(11, 12, 'rgba(56, 189, 248, 0.72)');
      drawPoseBone(11, 13, 'rgba(52, 211, 153, 0.92)');
      drawPoseBone(13, 15, 'rgba(52, 211, 153, 0.95)');
      drawPoseBone(12, 14, 'rgba(56, 189, 248, 0.92)');
      drawPoseBone(14, 16, 'rgba(56, 189, 248, 0.95)');

      for (const idx of [11, 12, 13, 14, 15, 16]) {
        const pt = pLm[idx];
        if ((pt.visibility ?? 0) < 0.22) continue;
        ctx.fillStyle = idx === 15 || idx === 16 ? '#34d399' : '#38bdf8';
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, idx >= 15 ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. HandLandmarker 21-point skeleton overlay
    const hands = handResult?.landmarks ?? [];
    for (const hand of hands) {
      if (!hand || hand.length < 21) continue;
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.92)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (const [a, b] of HAND_BONES) {
        ctx.beginPath();
        ctx.moveTo(hand[a].x * w, hand[a].y * h);
        ctx.lineTo(hand[b].x * w, hand[b].y * h);
        ctx.stroke();
      }
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(hand[0].x * w, hand[0].y * h, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c4b5fd';
      ctx.beginPath();
      ctx.arc(hand[9].x * w, hand[9].y * h, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 3. Face & Lip contour overlay
    const lm = faceResult.faceLandmarks?.[0];
    if (lm && lm.length > 400) {
      const drawPath = (indices: number[], color: string, width = 1.5) => {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        for (let i = 0; i < indices.length; i++) {
          const pt = lm[indices[i]];
          if (!pt) continue;
          const px = pt.x * w;
          const py = pt.y * h;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };

      drawPath(FACE_OVAL_IDX, 'rgba(251, 191, 36, 0.6)', 1.4);
      drawPath(LEFT_EYE_IDX, 'rgba(56, 189, 248, 0.9)', 1.5);
      drawPath(RIGHT_EYE_IDX, 'rgba(56, 189, 248, 0.9)', 1.5);
      drawPath(LIPS_OUTER_IDX, 'rgba(251, 113, 133, 0.95)', 1.8);
      drawPath(LIPS_INNER_IDX, 'rgba(253, 224, 71, 0.85)', 1.2);
    }

    ctx.restore();
  }

  public dispose(): void {
    this.stop();
    if (this.faceLandmarker) {
      this.faceLandmarker.close();
      this.faceLandmarker = null;
    }
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
  }
}
