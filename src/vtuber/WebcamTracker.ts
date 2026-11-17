import * as THREE from 'three';
import {
  FaceLandmarker,
  FilesetResolver,
  PoseLandmarker,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import type { ArmDirection3D, RawWebcamPose } from '../types/vtuber';

const FACE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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

function dist2D(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class WebcamTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private poseLoadStarted = false;
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private active = false;
  private lastVideoTime = -1;
  private lastFaceTs = 0;
  private lastPoseTs = 0;
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

  private async createFaceLandmarker(vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>): Promise<FaceLandmarker> {
    try {
      return await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.45,
        minFacePresenceConfidence: 0.45,
        minTrackingConfidence: 0.45,
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

  private async createPoseLandmarker(vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>): Promise<PoseLandmarker | null> {
    try {
      return await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
        minPoseDetectionConfidence: 0.4,
        minPosePresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      });
    } catch {
      try {
        return await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: POSE_MODEL_URL, delegate: 'CPU' },
          runningMode: 'VIDEO',
          numPoses: 1,
          minPoseDetectionConfidence: 0.4,
          minPosePresenceConfidence: 0.4,
          minTrackingConfidence: 0.4,
        });
      } catch {
        return null;
      }
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

    try {
      const vision = await FilesetResolver.forVisionTasks('/mediapipe/wasm');

      // Start loading PoseLandmarker (for real-time 3D arm tracking) in parallel!
      if (!this.poseLandmarker && !this.poseLoadStarted) {
        this.poseLoadStarted = true;
        void this.createPoseLandmarker(vision).then((pl) => {
          if (pl) {
            this.poseLandmarker = pl;
          }
          this.poseLoadStarted = false;
        });
      }

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
      poseReady: Boolean(this.poseLandmarker),
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

    this.drawPreview(faceResult, poseResult, mirror);

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

      // Extract all 52 ARKit blendshapes
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

      // === FULL MOUTH TRACKING (Fused ARKit Blendshapes + Geometric 3D Lip Landmarks) ===
      const forehead = lm[10];
      const chin = lm[152];
      const upperInnerLip = lm[13];
      const lowerInnerLip = lm[14];
      const cornerLeft = lm[61];
      const cornerRight = lm[291];

      const faceH = Math.max(0.05, dist2D(forehead, chin));
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

      // Geometric corner width normalized by face height (neutral ~ 0.31)
      const geoWidthRatio = dist2D(cornerLeft, cornerRight) / faceH;
      const geoWidthNorm = clamp(geoWidthRatio / 0.31, 0.55, 1.35);
      const bsWidth = 1.0 + (smileL + smileR) * 0.16 + stretch * 0.25 - pucker * 0.52 - funnel * 0.36;
      mouthWidth = clamp(bsWidth * 0.65 + geoWidthNorm * 0.35, 0.42, 1.35);

      mouthRound = clamp(pucker * 1.15 + funnel * 1.0 + Math.max(0, 0.85 - mouthWidth) * 0.8, 0, 1);

      // Geometric corner lift relative to lip midpoint
      const lipMidY = (upperInnerLip.y + lowerInnerLip.y) * 0.5;
      const cornerAvgY = (cornerLeft.y + cornerRight.y) * 0.5;
      const geoSmile = clamp(((lipMidY - cornerAvgY) / faceH) * 8.0, -0.7, 0.7);
      const bsSmile = ((smileL + smileR) * 0.5 - (frownL + frownR) * 0.62) * 1.9;
      mouthSmile = clamp(bsSmile * 0.72 + geoSmile * 0.45, -1, 1);

      // Roll-compensated geometric mouth shift & asymmetric smirk (immune to Left/Right blendshape ambiguity!)
      // In raw image coords: lm[61] is image-left (user's right corner), lm[291] is image-right (user's left corner).
      const eyeL = lm[33];
      const eyeR = lm[263];
      const faceRollAngle = Math.atan2(eyeR.y - eyeL.y, eyeR.x - eyeL.x);
      const cosR = Math.cos(-faceRollAngle);
      const sinR = Math.sin(-faceRollAngle);

      const dCornerX = cornerRight.x - cornerLeft.x;
      const dCornerY = cornerRight.y - cornerLeft.y;
      // Rotate corner vector into head-upright frame: positive rotCornerY means image-left corner (61) is HIGHER than image-right (291)
      const rotCornerY = dCornerX * sinR + dCornerY * cosR;
      const geoSkew = clamp((rotCornerY / faceH) * 9.5, -1, 1);
      // In mirror=true: image-left (user's right) maps to screen-right (+X) -> positive skew lifts screen-right corner!
      mouthSkew = clamp(geoSkew * (mirror ? 1 : -1), -1, 1);

      const faceCenterX = (eyeL.x + eyeR.x) * 0.5;
      const mouthCenterX = (cornerLeft.x + cornerRight.x) * 0.5;
      const mouthCenterY = (cornerLeft.y + cornerRight.y) * 0.5;
      const relX = mouthCenterX - faceCenterX;
      const relY = mouthCenterY - (eyeL.y + eyeR.y) * 0.5;
      const rotShiftX = relX * cosR - relY * sinR;
      const geoShift = clamp((rotShiftX / faceH) * 5.2, -1, 1);
      // In mirror=true: image-left shift (rotShiftX < 0) maps to screen-right (+X)!
      mouthShiftX = clamp(geoShift * (mirror ? -1 : 1), -1, 1);

      browUp = clamp(get('browInnerUp') * 1.4, 0, 1);
      browDown = clamp(((get('browDownLeft') + get('browDownRight')) * 0.5) * 1.5, 0, 1);
    }

    // 2. Parse Full 3D Arms & Shoulders from PoseLandmarker
    let armL: ArmDirection3D = { ...REST_ARM_L };
    let armR: ArmDirection3D = { ...REST_ARM_R };
    let shoulderRoll = 0;
    let poseDetected = false;

    const pLm = poseResult?.landmarks?.[0];
    const wLm = poseResult?.worldLandmarks?.[0];

    if (trackArms && pLm && pLm.length >= 21) {
      poseDetected = true;
      // Use metric worldLandmarks for isotropic 3D direction vectors, and normalized landmarks for visibility/in-frame checks
      const src = wLm && wLm.length >= 21 ? wLm : pLm;

      const buildArmVector = (
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

        // Check that shoulder is visible and at least elbow or wrist is reasonably tracked & near/inside frame
        const elbowInView = eVis > 0.32 && eNorm.y < 1.25 && eNorm.x > -0.25 && eNorm.x < 1.25;
        const wristInView = wVis > 0.34 && wNorm.y < 1.2 && wNorm.x > -0.2 && wNorm.x < 1.2;

        if (sVis < 0.3 || (!elbowInView && !wristInView)) {
          return { x: 0, y: -1, z: 0, detected: false, confidence: 0 };
        }

        const s = src[shoulderIdx];
        const e = src[elbowIdx];
        const w = src[wristIdx];
        const idxFinger = src[indexIdx];

        // Compute target vector from shoulder: blend shoulder->elbow & shoulder->wrist/hand
        // so both upper-arm raises AND forearm waves/reaches translate crisply onto Baby's arm!
        let vx = 0;
        let vy = 0;
        let vz = 0;

        if (wristInView) {
          const useHand = (iNorm.visibility ?? 0) > 0.35;
          const handX = useHand ? w.x * 0.72 + idxFinger.x * 0.28 : w.x;
          const handY = useHand ? w.y * 0.72 + idxFinger.y * 0.28 : w.y;
          const handZ = useHand ? w.z * 0.72 + idxFinger.z * 0.28 : w.z;

          if (elbowInView) {
            vx = (e.x - s.x) * 0.28 + (handX - s.x) * 0.72;
            vy = (e.y - s.y) * 0.28 + (handY - s.y) * 0.72;
            vz = (e.z - s.z) * 0.28 + (handZ - s.z) * 0.72;
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

        // Convert MediaPipe camera coords (+X right in raw image, +Y down, -Z toward camera)
        // to Three.js character Torso coords (+X viewer-right/Arm.L, +Y up, +Z forward toward viewer)
        const dx = mirror ? -vx : vx;
        const dy = -vy;
        // Scale depth gently so forward reaches look natural without noisy Z jumps
        const dz = clamp(-vz * 0.75, -0.45, 0.95);

        const len = Math.hypot(dx, dy, dz);
        if (len < 1e-4) {
          return { x: 0, y: -1, z: 0, detected: false, confidence: 0 };
        }

        return {
          x: dx / len,
          y: dy / len,
          z: dz / len,
          detected: true,
          confidence: wristInView ? wVis : eVis,
        };
      };

      // In MediaPipe Pose: 11/13/15/19 = user's anatomical LEFT arm, 12/14/16/20 = user's anatomical RIGHT arm.
      // In mirror (selfie) mode: user's RIGHT arm drives Arm.L (screen right, +X) and user's LEFT arm drives Arm.R (screen left, -X)!
      const userLeftArm = buildArmVector(11, 13, 15, 19);
      const userRightArm = buildArmVector(12, 14, 16, 20);

      armL = mirror ? userRightArm : userLeftArm;
      armR = mirror ? userLeftArm : userRightArm;

      // Shoulder roll tilt from 11 <-> 12
      const shL = pLm[11];
      const shR = pLm[12];
      if ((shL.visibility ?? 0) > 0.4 && (shR.visibility ?? 0) > 0.4) {
        const sdx = shL.x - shR.x;
        const sdy = shL.y - shR.y;
        const rawTilt = Math.atan2(sdy, Math.abs(sdx) + 1e-4);
        shoulderRoll = clamp(rawTilt * (mirror ? 1 : -1), -0.45, 0.45);
      }
    }

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
      poseReady: Boolean(this.poseLandmarker),
      poseDetected,
    };

    return this.latestPose;
  }

  private drawPreview(
    faceResult: FaceLandmarkerResult,
    poseResult: PoseLandmarkerResult | null,
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

    // 1. Draw live Arm & Shoulder skeleton overlay (emerald/cyan)
    const pLm = poseResult?.landmarks?.[0];
    if (pLm && pLm.length >= 17) {
      const drawBone = (aIdx: number, bIdx: number, color: string) => {
        const a = pLm[aIdx];
        const b = pLm[bIdx];
        if ((a.visibility ?? 0) < 0.3 || (b.visibility ?? 0) < 0.3) return;
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      };

      const drawJoint = (idx: number, color: string, r: number) => {
        const j = pLm[idx];
        if ((j.visibility ?? 0) < 0.32) return;
        ctx.beginPath();
        ctx.arc(j.x * w, j.y * h, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      };

      // Shoulders bar
      drawBone(11, 12, 'rgba(56, 189, 248, 0.75)');
      // Left arm (11 -> 13 -> 15)
      drawBone(11, 13, 'rgba(34, 197, 94, 0.92)');
      drawBone(13, 15, 'rgba(74, 222, 128, 0.95)');
      // Right arm (12 -> 14 -> 16)
      drawBone(12, 14, 'rgba(56, 189, 248, 0.92)');
      drawBone(14, 16, 'rgba(125, 211, 252, 0.95)');

      drawJoint(11, '#38bdf8', 3.5);
      drawJoint(12, '#38bdf8', 3.5);
      drawJoint(13, '#22c55e', 3.5);
      drawJoint(14, '#38bdf8', 3.5);
      drawJoint(15, '#bbf7d0', 5);
      drawJoint(16, '#bae6fd', 5);
    }

    // 2. Draw crisp Face & Full Lips overlay
    const lm = faceResult.faceLandmarks?.[0];
    if (lm && lm.length > 400) {
      const strokeLoop = (indices: number[], color: string, width: number) => {
        ctx.beginPath();
        indices.forEach((idx, i) => {
          const p = lm[idx];
          if (!p) return;
          if (i === 0) ctx.moveTo(p.x * w, p.y * h);
          else ctx.lineTo(p.x * w, p.y * h);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
      };

      strokeLoop(FACE_OVAL_IDX, 'rgba(56, 189, 248, 0.7)', 1.3);
      strokeLoop(LEFT_EYE_IDX, 'rgba(250, 204, 21, 0.95)', 1.7);
      strokeLoop(RIGHT_EYE_IDX, 'rgba(250, 204, 21, 0.95)', 1.7);
      strokeLoop(LIPS_OUTER_IDX, 'rgba(244, 63, 94, 0.95)', 2.0);
      strokeLoop(LIPS_INNER_IDX, 'rgba(253, 164, 175, 0.9)', 1.3);
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
  }
}
