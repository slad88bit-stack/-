import * as THREE from 'three';
import type { EmotionId, FaceRenderState } from '../types/vtuber';

// Exact sRGB hex computed from Mat_BabyNoob_Head linear [0.8468732, 0.5332764, 0.0069954]
export const BABY_NOOB_YELLOW_HEX = '#edc114';
export const BABY_NOOB_BLUE_HEX = '#0648a6';

const CANVAS_SIZE = 1024;
const LEFT_EYE_X = 313;
const RIGHT_EYE_X = 711;
const EYE_Y = 558;
const EYE_RADIUS = 32;
const MOUTH_X = 512;
const MOUTH_BASE_Y = 626;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class FaceCanvasEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  public readonly texture: THREE.CanvasTexture;
  private lastSignature = '';

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CANVAS_SIZE;
    this.canvas.height = CANVAS_SIZE;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D context for Baby Noob face texture');
    }
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    // Verified from GLB TEXCOORD_0: corr(v, Y) = -1.000 => flipY MUST be false!
    this.texture.flipY = false;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    // Initial classic Baby Noob face render
    this.render({
      emotion: 'happy',
      blinkL: 0,
      blinkR: 0,
      gazeX: 0,
      gazeY: 0,
      mouthOpen: 0,
      mouthSmile: 0.7,
      mouthRound: 0,
      browUp: 0,
      browDown: 0,
      blushIntensity: 0,
      isLipSyncActive: false,
      time: 0,
    });
  }

  public render(state: FaceRenderState): void {
    const isAnimatedEmotion = state.emotion === 'hype' || state.emotion === 'cry' || state.emotion === 'sleepy';
    const sig = isAnimatedEmotion
      ? `${state.emotion}-${Math.floor(state.time * 30)}-${state.mouthOpen.toFixed(2)}-${state.blinkL.toFixed(2)}`
      : [
          state.emotion,
          state.blinkL.toFixed(2),
          state.blinkR.toFixed(2),
          state.gazeX.toFixed(2),
          state.gazeY.toFixed(2),
          state.mouthOpen.toFixed(2),
          state.mouthSmile.toFixed(2),
          state.mouthRound.toFixed(2),
          state.browUp.toFixed(2),
          state.browDown.toFixed(2),
          state.blushIntensity.toFixed(2),
          state.isLipSyncActive ? '1' : '0',
        ].join('|');

    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    const ctx = this.ctx;
    ctx.save();

    // 1. Solid Baby Noob yellow base (ensures ClampToEdge outside UV [0..1] matches arms seamlessly!)
    ctx.fillStyle = BABY_NOOB_YELLOW_HEX;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const gx = clamp(state.gazeX, -1, 1) * 28;
    const gy = clamp(state.gazeY, -1, 1) * 18;

    // 2. Soft Kawaii Blush Cheeks (under eyes when blushing / headpat / hype / blushAlways)
    const totalBlush = clamp(
      state.blushIntensity +
        (state.emotion === 'blush' ? 0.9 : 0) +
        (state.emotion === 'hype' ? 0.55 : 0) +
        (state.emotion === 'wink' ? 0.35 : 0),
      0,
      1,
    );
    if (totalBlush > 0.02) {
      this.drawBlush(ctx, totalBlush, gx * 0.25, gy * 0.2);
    }

    // 3. Draw Left & Right Eyes
    const effBlinkL = state.emotion === 'wink' ? 1.0 : state.emotion === 'blush' ? 1.0 : state.blinkL;
    const effBlinkR = state.emotion === 'blush' ? 1.0 : state.blinkR;

    this.drawEye(ctx, LEFT_EYE_X + gx, EYE_Y + gy, effBlinkL, state.emotion, true, state.time);
    this.drawEye(ctx, RIGHT_EYE_X + gx, EYE_Y + gy, effBlinkR, state.emotion, false, state.time);

    // 4. Optional expressive eyebrows (angry / surprised / cry / webcam brows)
    this.drawEyebrows(ctx, state, gx * 0.4, gy * 0.4);

    // 5. Dynamic VTuber Mouth with Lip-Sync + Emotion Articulation
    this.drawMouth(ctx, state, gx * 0.16, gy * 0.14);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  private drawBlush(ctx: CanvasRenderingContext2D, intensity: number, ox: number, oy: number): void {
    const drawCheek = (cx: number, cy: number) => {
      const grad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 62);
      grad.addColorStop(0, `rgba(255, 92, 128, ${0.56 * intensity})`);
      grad.addColorStop(0.6, `rgba(255, 110, 140, ${0.32 * intensity})`);
      grad.addColorStop(1, 'rgba(255, 110, 140, 0)');
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1.25, 0.72);
      ctx.beginPath();
      ctx.arc(0, 0, 62, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Tiny anime blush hatch strokes when strong
      if (intensity > 0.45) {
        ctx.strokeStyle = `rgba(232, 62, 102, ${(intensity - 0.35) * 0.65})`;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo(i * 18 - 4, 14);
          ctx.lineTo(i * 18 + 6, -12);
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    drawCheek(LEFT_EYE_X - 24 + ox, EYE_Y + 72 + oy);
    drawCheek(RIGHT_EYE_X + 24 + ox, EYE_Y + 72 + oy);
  }

  private drawEye(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    blink: number,
    emotion: EmotionId,
    isLeft: boolean,
    time: number,
  ): void {
    ctx.save();

    // Winking left eye uses playful curved chevron/happy arc
    if (emotion === 'wink' && isLeft) {
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 38, cy - 18);
      ctx.quadraticCurveTo(cx + 8, cy - 2, cx + 36, cy + 4);
      ctx.quadraticCurveTo(cx + 6, cy + 12, cx - 36, cy + 26);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Happy curved blink arc (exact match to face_blink.png!)
    if (blink > 0.58) {
      const arcBlend = clamp((blink - 0.58) / 0.42, 0, 1);
      const halfW = lerp(34, 42, arcBlend);
      const archLift = lerp(10, 26, arcBlend);
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 15;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - halfW, cy + 4);
      ctx.quadraticCurveTo(cx, cy - archLift, cx + halfW, cy + 4);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Open / partially blinking dot eye
    const squashY = lerp(1.0, 0.24, clamp(blink / 0.58, 0, 1));
    const stretchX = lerp(1.0, 1.18, clamp(blink / 0.58, 0, 1));

    let radius = EYE_RADIUS;
    if (emotion === 'surprised') radius = 38;
    else if (emotion === 'hype') radius = 38;
    else if (emotion === 'cry') radius = 37;

    ctx.translate(cx, cy);
    ctx.scale(stretchX, squashY);

    // Base bold dark eye dot (authentic Baby Noob style)
    ctx.fillStyle = '#0c0c0c';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // Emotion-specific eye details
    if (emotion === 'hype') {
      // Sparkling golden 4-point star inside eye!
      const pulse = 0.92 + Math.sin(time * 9.0 + (isLeft ? 0 : 1.1)) * 0.12;
      ctx.save();
      ctx.scale(pulse, pulse);
      ctx.rotate(Math.sin(time * 3.5) * 0.1);
      this.drawFourPointStar(ctx, 0, -2, 23, 8.5, '#ffe766');
      this.drawFourPointStar(ctx, 0, -2, 13, 5, '#ffffff');
      ctx.restore();
    } else if (emotion === 'surprised') {
      // Crisp bright catchlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-11, -11, 8.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (emotion === 'cry') {
      // Big shimmering teary highlights
      const wobble = Math.sin(time * 10 + (isLeft ? 0 : 1.5)) * 2.5;
      ctx.fillStyle = '#e0f7ff';
      ctx.beginPath();
      ctx.arc(-11, -11 + wobble * 0.3, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#9be7ff';
      ctx.beginPath();
      ctx.arc(11, 12 - wobble * 0.3, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Animated shimmering tear pool + falling teardrop below eye
      ctx.save();
      const tearGrad = ctx.createLinearGradient(cx, cy + 20, cx, cy + 120);
      tearGrad.addColorStop(0, 'rgba(130, 224, 255, 0.92)');
      tearGrad.addColorStop(1, 'rgba(65, 178, 255, 0.72)');
      ctx.fillStyle = tearGrad;

      // Tear rim at bottom of eye
      ctx.beginPath();
      ctx.ellipse(cx, cy + 32, 34, 13, 0, 0, Math.PI * 2);
      ctx.fill();

      // Falling drop cycle
      const dropT = ((time * 1.15 + (isLeft ? 0 : 0.45)) % 1.0);
      const dropY = cy + 38 + dropT * 90;
      const dropAlpha = Math.sin(dropT * Math.PI);
      const dropX = cx + (isLeft ? -14 : 14);
      ctx.fillStyle = `rgba(115, 215, 255, ${0.9 * dropAlpha})`;
      ctx.beginPath();
      ctx.moveTo(dropX, dropY - 18);
      ctx.quadraticCurveTo(dropX + 14, dropY + 4, dropX, dropY + 14);
      ctx.quadraticCurveTo(dropX - 14, dropY + 4, dropX, dropY - 18);
      ctx.fill();
      ctx.restore();
      return;
    } else if (emotion === 'sleepy') {
      // Half-closed yellow eyelid covering upper 55% of eye + soft lid line
      ctx.restore();
      ctx.save();
      const droop = Math.sin(time * 2.2) * 3;
      ctx.fillStyle = BABY_NOOB_YELLOW_HEX;
      ctx.fillRect(cx - 46, cy - 48, 92, 46 + droop);
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 11;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 38, cy - 2 + droop);
      ctx.quadraticCurveTo(cx, cy + 6 + droop, cx + 38, cy - 2 + droop);
      ctx.stroke();
      ctx.restore();
      return;
    } else if (emotion === 'angry') {
      // Slightly flattened top via angled brow cut
      ctx.restore();
      ctx.save();
      ctx.fillStyle = BABY_NOOB_YELLOW_HEX;
      ctx.beginPath();
      if (isLeft) {
        ctx.moveTo(cx - 45, cy - 44);
        ctx.lineTo(cx + 45, cy - 20);
        ctx.lineTo(cx + 45, cy - 58);
        ctx.lineTo(cx - 45, cy - 58);
      } else {
        ctx.moveTo(cx - 45, cy - 20);
        ctx.lineTo(cx + 45, cy - 44);
        ctx.lineTo(cx + 45, cy - 58);
        ctx.lineTo(cx - 45, cy - 58);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.restore();
  }

  private drawFourPointStar(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    outerR: number,
    innerR: number,
    color: string,
  ): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawEyebrows(
    ctx: CanvasRenderingContext2D,
    state: FaceRenderState,
    ox: number,
    oy: number,
  ): void {
    const showAngry = state.emotion === 'angry' || state.browDown > 0.45;
    const showSurprised = state.emotion === 'surprised' || state.browUp > 0.45;
    const showCry = state.emotion === 'cry';

    if (!showAngry && !showSurprised && !showCry) return;

    ctx.save();
    ctx.strokeStyle = '#0c0c0c';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';

    const lx = LEFT_EYE_X + ox;
    const rx = RIGHT_EYE_X + ox;
    const by = EYE_Y - 58 + oy;

    if (showAngry) {
      const strength = state.emotion === 'angry' ? 1.0 : clamp((state.browDown - 0.35) / 0.65, 0, 1);
      const tilt = 22 * strength;
      // Left brow angled down-right
      ctx.beginPath();
      ctx.moveTo(lx - 40, by - tilt * 0.5 + 16);
      ctx.lineTo(lx + 40, by + tilt + 16);
      ctx.stroke();
      // Right brow angled down-left
      ctx.beginPath();
      ctx.moveTo(rx - 40, by + tilt + 16);
      ctx.lineTo(rx + 40, by - tilt * 0.5 + 16);
      ctx.stroke();
    } else if (showCry) {
      // Worried upward-inner brows
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(lx - 38, by + 12);
      ctx.quadraticCurveTo(lx + 4, by + 4, lx + 34, by - 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx + 38, by + 12);
      ctx.quadraticCurveTo(rx - 4, by + 4, rx - 34, by - 12);
      ctx.stroke();
    } else if (showSurprised) {
      const lift = (state.emotion === 'surprised' ? 1 : state.browUp) * 18;
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(lx - 34, by - lift);
      ctx.quadraticCurveTo(lx, by - 22 - lift, lx + 34, by - lift);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rx - 34, by - lift);
      ctx.quadraticCurveTo(rx, by - 22 - lift, rx + 34, by - lift);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawMouth(
    ctx: CanvasRenderingContext2D,
    state: FaceRenderState,
    ox: number,
    oy: number,
  ): void {
    const mx = MOUTH_X + ox;
    const my = MOUTH_BASE_Y + oy;
    const open = clamp(state.mouthOpen, 0, 1);
    const round = clamp(state.mouthRound, 0, 1);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Special emotion resting mouths when NOT actively lip-syncing loudly
    if (!state.isLipSyncActive || open < 0.08) {
      if (state.emotion === 'blush' && open < 0.15) {
        // Cute kawaii ':3' cat smile!
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(mx - 62, my + 30);
        ctx.quadraticCurveTo(mx - 31, my + 66, mx, my + 34);
        ctx.quadraticCurveTo(mx + 31, my + 66, mx + 62, my + 30);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'angry' && open < 0.16) {
        // Cute grumpy pout curve
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(mx - 68, my + 68);
        ctx.quadraticCurveTo(mx, my + 24, mx + 68, my + 68);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'cry' && open < 0.16) {
        // Wobbling sad mouth
        const wob = Math.sin(state.time * 12) * 5;
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(mx - 68, my + 72);
        ctx.bezierCurveTo(mx - 26, my + 26 + wob, mx + 26, my + 26 - wob, mx + 68, my + 72);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'sleepy' && open < 0.15) {
        // Small peaceful cozy 'o' / gentle smile
        const breathe = Math.sin(state.time * 2.2) * 5;
        ctx.fillStyle = '#d8244e';
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 13;
        ctx.beginPath();
        ctx.ellipse(mx, my + 56, 26 + breathe * 0.4, 22 + breathe, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'surprised' && open < 0.25) {
        // Expressive surprised 'O' mouth!
        this.drawRoundOMouth(ctx, mx, my + 62, 48, 60);
        ctx.restore();
        return;
      }
    }

    // Determine effective openness:
    // - When live lip-sync (Mic / Webcam / Demo speech) is active: follows real voice/jawOpen directly!
    // - When idle in 'happy' / 'hype' / 'wink': shows Baby Noob's authentic iconic joyful D-smile from face_open.png!
    let effOpen = open;
    if (!state.isLipSyncActive) {
      if (state.emotion === 'happy' || state.emotion === 'wink') {
        effOpen = 0.86; // Authentic face_open.png proportion!
      } else if (state.emotion === 'hype') {
        effOpen = 1.0;
      }
    }

    // Closed happy smile when silent during active lip-sync
    if (effOpen < 0.08) {
      const smileLift = state.emotion === 'angry' || state.emotion === 'cry' ? -18 : 26;
      const halfW = lerp(74, 96, clamp((state.mouthSmile + 1) * 0.5, 0, 1));
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 15;
      ctx.beginPath();
      ctx.moveTo(mx - halfW, my + 38);
      ctx.quadraticCurveTo(mx, my + 38 + smileLift, mx + halfW, my + 38);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Rounded vowel ('O' / 'U') when mouthRound is strong (formant or pucker or surprised talking)
    if (round > 0.55 || (state.emotion === 'surprised' && effOpen > 0.2)) {
      const rMix = state.emotion === 'surprised' ? 0.85 : round;
      const rx = lerp(42, 62, effOpen) * lerp(1.15, 0.82, rMix);
      const ry = lerp(30, 74, effOpen);
      this.drawRoundOMouth(ctx, mx, my + 56, rx, ry);
      ctx.restore();
      return;
    }

    // Authentic Baby Noob D-Smile / Talking Mouth (matching face_open.png exact dimensions & 2-tone fill!)
    // In face_open.png: width=226 (halfW=113), top y=623..646, bottom y=791 (height ~160)
    const smileFactor =
      state.emotion === 'angry' || state.emotion === 'cry'
        ? -0.35
        : clamp(state.mouthSmile, -0.4, 1);

    const halfW = lerp(74, 114, clamp(effOpen * 0.75 + 0.25, 0, 1)) * lerp(0.84, 1.05, (smileFactor + 1) * 0.5);
    const topEdgeY = my + lerp(24, -4, effOpen);
    const topDip = lerp(10, 22, effOpen) * (smileFactor >= 0 ? 1 : -0.6);
    const bottomY = topEdgeY + lerp(44, 166, effOpen);

    const traceMouthPath = () => {
      ctx.beginPath();
      // Top lip slight dip (matching face_open.png!)
      ctx.moveTo(mx - halfW, topEdgeY);
      ctx.quadraticCurveTo(mx, topEdgeY + topDip, mx + halfW, topEdgeY);
      // Right cheek down into full rounded U bottom
      ctx.bezierCurveTo(
        mx + halfW * 1.02,
        lerp(topEdgeY, bottomY, 0.62),
        mx + halfW * 0.54,
        bottomY,
        mx,
        bottomY,
      );
      // Left cheek back up to left corner
      ctx.bezierCurveTo(
        mx - halfW * 0.54,
        bottomY,
        mx - halfW * 1.02,
        lerp(topEdgeY, bottomY, 0.62),
        mx - halfW,
        topEdgeY,
      );
      ctx.closePath();
    };

    // Clip interior for authentic two-tone shading (#b0163a upper cavity + #d8244e bright tongue!)
    ctx.save();
    traceMouthPath();
    ctx.fillStyle = '#b0163a';
    ctx.fill();
    ctx.clip();

    // Bright pink-red lower tongue dome matching face_open.png
    const tongueTopY = lerp(topEdgeY + topDip + 8, bottomY, 0.28);
    ctx.fillStyle = '#d8244e';
    ctx.beginPath();
    ctx.ellipse(mx, bottomY + 14, halfW * 1.08, Math.max(24, bottomY - tongueTopY + 18), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Bold iconic dark outline matching face_open.png
    traceMouthPath();
    ctx.strokeStyle = '#0c0c0c';
    ctx.lineWidth = 16;
    ctx.stroke();

    ctx.restore();
  }

  private drawRoundOMouth(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#b0163a';
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = '#d8244e';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.52, rx * 0.95, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#0c0c0c';
    ctx.lineWidth = 15;
    ctx.stroke();
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
