import * as THREE from 'three';
import type { CharacterId, EmotionId, FaceRenderState, FaceStyleId } from '../types/vtuber';

export const BABY_NOOB_YELLOW_HEX = '#edc114';
export const BABY_NOOB_BLUE_HEX = '#0648a6';

const CANVAS_SIZE = 1024;

interface FaceLayout {
  leftEyeX: number;
  rightEyeX: number;
  eyeY: number;
  mouthX: number;
  mouthBaseY: number;
  scale: number; // relative feature scale for UV coverage
}

// Measured directly from original textures:
// - face_open.png (1024x1024): eyes (313,558) & (711,558), mouth y=623..791
// - guest_face_open.png (512x512 -> x2): eyes (372,392) & (652,392), mouth y=576..684
// - mguest_face_open.png (512x512 -> x2): eyes (424,396) & (600,396), mouth y=588..708
const FACE_LAYOUTS: Record<CharacterId, FaceLayout> = {
  noob: {
    leftEyeX: 313,
    rightEyeX: 711,
    eyeY: 558,
    mouthX: 512,
    mouthBaseY: 626,
    scale: 1.0,
  },
  guest: {
    leftEyeX: 372,
    rightEyeX: 652,
    eyeY: 392,
    mouthX: 512,
    mouthBaseY: 560,
    scale: 1.18,
  },
  modern_guest: {
    leftEyeX: 424,
    rightEyeX: 600,
    eyeY: 396,
    mouthX: 512,
    mouthBaseY: 572,
    scale: 1.12,
  },
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function darkenHex(hex: string, factor = 0.72): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#9b1332';
  const r = Math.round(parseInt(clean.slice(0, 2), 16) * factor);
  const g = Math.round(parseInt(clean.slice(2, 4), 16) * factor);
  const b = Math.round(parseInt(clean.slice(4, 6), 16) * factor);
  return `rgb(${clamp(r, 0, 255)}, ${clamp(g, 0, 255)}, ${clamp(b, 0, 255)})`;
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
      throw new Error('Could not initialize 2D context for VTuber face texture');
    }
    this.ctx = ctx;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false; // Verified across all 3 GLBs: corr(v, Y) = -1.000
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.anisotropy = 8;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;

    this.render({
      characterId: 'noob',
      faceStyle: 'auto',
      skinColor: BABY_NOOB_YELLOW_HEX,
      eyeColor: '#0c0c0c',
      mouthColor: '#d8244e',
      emotion: 'happy',
      blinkL: 0,
      blinkR: 0,
      gazeX: 0,
      gazeY: 0,
      mouthOpen: 0,
      mouthSmile: 0.7,
      mouthWidth: 1.0,
      mouthRound: 0,
      mouthShiftX: 0,
      mouthSkew: 0,
      browUp: 0,
      browDown: 0,
      blushIntensity: 0,
      isLipSyncActive: false,
      isFullMouthTracked: false,
      time: 0,
    });
  }

  private resolveFaceStyle(characterId: CharacterId, requested: FaceStyleId): Exclude<FaceStyleId, 'auto'> {
    if (requested !== 'auto') return requested;
    return characterId === 'noob' ? 'kawaii_dots' : 'classic_pills';
  }

  public render(state: FaceRenderState): void {
    const style = this.resolveFaceStyle(state.characterId, state.faceStyle);
    const isAnimatedEmotion = state.emotion === 'hype' || state.emotion === 'cry' || state.emotion === 'sleepy';
    const sig = isAnimatedEmotion
      ? `${state.characterId}|${style}|${state.skinColor}|${state.eyeColor}|${state.mouthColor}|${state.emotion}|${Math.floor(state.time * 30)}|${state.mouthOpen.toFixed(2)}|${state.mouthWidth.toFixed(2)}|${state.mouthSmile.toFixed(2)}|${state.blinkL.toFixed(2)}`
      : [
          state.characterId,
          style,
          state.skinColor,
          state.eyeColor,
          state.mouthColor,
          state.emotion,
          state.blinkL.toFixed(2),
          state.blinkR.toFixed(2),
          state.gazeX.toFixed(2),
          state.gazeY.toFixed(2),
          state.mouthOpen.toFixed(2),
          state.mouthSmile.toFixed(2),
          state.mouthWidth.toFixed(2),
          state.mouthRound.toFixed(2),
          state.mouthShiftX.toFixed(2),
          state.mouthSkew.toFixed(2),
          state.browUp.toFixed(2),
          state.browDown.toFixed(2),
          state.blushIntensity.toFixed(2),
          state.isLipSyncActive ? '1' : '0',
          state.isFullMouthTracked ? '1' : '0',
        ].join('|');

    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    const layout = FACE_LAYOUTS[state.characterId];
    const ctx = this.ctx;
    ctx.save();

    // 1. Solid head/skin base color (clamps seamlessly outside UV [0..1])
    ctx.fillStyle = state.skinColor;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const gx = clamp(state.gazeX, -1, 1) * 28 * layout.scale;
    const gy = clamp(state.gazeY, -1, 1) * 18 * layout.scale;

    // 2. Kawaii Blush Cheeks
    const totalBlush = clamp(
      state.blushIntensity +
        (state.emotion === 'blush' ? 0.92 : 0) +
        (state.emotion === 'hype' ? 0.55 : 0) +
        (state.emotion === 'wink' ? 0.35 : 0),
      0,
      1,
    );
    if (totalBlush > 0.02) {
      this.drawBlush(ctx, layout, totalBlush, gx * 0.25, gy * 0.2);
    }

    // 3. Left & Right Eyes
    const effBlinkL = state.emotion === 'wink' || state.emotion === 'blush' ? 1.0 : state.blinkL;
    const effBlinkR = state.emotion === 'blush' ? 1.0 : state.blinkR;

    this.drawEye(
      ctx,
      layout.leftEyeX + gx,
      layout.eyeY + gy,
      effBlinkL,
      state.emotion,
      style,
      state.skinColor,
      state.eyeColor,
      layout.scale,
      true,
      state.time,
    );
    this.drawEye(
      ctx,
      layout.rightEyeX + gx,
      layout.eyeY + gy,
      effBlinkR,
      state.emotion,
      style,
      state.skinColor,
      state.eyeColor,
      layout.scale,
      false,
      state.time,
    );

    // 4. Expressive Eyebrows
    this.drawEyebrows(ctx, layout, state, style, gx * 0.4, gy * 0.4);

    // 5. Dynamic VTuber Mouth
    this.drawMouth(ctx, layout, state, style, gx * 0.16, gy * 0.14);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  private drawBlush(
    ctx: CanvasRenderingContext2D,
    layout: FaceLayout,
    intensity: number,
    ox: number,
    oy: number,
  ): void {
    const sc = layout.scale;
    const drawCheek = (cx: number, cy: number) => {
      const r = 60 * sc;
      const grad = ctx.createRadialGradient(cx, cy, 8 * sc, cx, cy, r);
      grad.addColorStop(0, `rgba(255, 92, 132, ${0.56 * intensity})`);
      grad.addColorStop(0.6, `rgba(255, 110, 145, ${0.32 * intensity})`);
      grad.addColorStop(1, 'rgba(255, 110, 145, 0)');
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1.25, 0.72);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      if (intensity > 0.45) {
        ctx.strokeStyle = `rgba(232, 62, 102, ${(intensity - 0.35) * 0.65})`;
        ctx.lineWidth = 5 * sc;
        ctx.lineCap = 'round';
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath();
          ctx.moveTo((i * 18 - 4) * sc, 14 * sc);
          ctx.lineTo((i * 18 + 6) * sc, -12 * sc);
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const dropY = 82 * sc;
    drawCheek(layout.leftEyeX - 30 * sc + ox, layout.eyeY + dropY + oy);
    drawCheek(layout.rightEyeX + 30 * sc + ox, layout.eyeY + dropY + oy);
  }

  private drawEye(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    blink: number,
    emotion: EmotionId,
    style: Exclude<FaceStyleId, 'auto'>,
    skinColor: string,
    eyeColor: string,
    sc: number,
    isLeft: boolean,
    time: number,
  ): void {
    ctx.save();

    // Playful wink chevron on left eye
    if (emotion === 'wink' && isLeft) {
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 16 * sc;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 38 * sc, cy - 18 * sc);
      ctx.quadraticCurveTo(cx + 8 * sc, cy - 2 * sc, cx + 36 * sc, cy + 4 * sc);
      ctx.quadraticCurveTo(cx + 6 * sc, cy + 12 * sc, cx - 36 * sc, cy + 26 * sc);
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Happy curved blink arc (matches face_blink.png!)
    if (blink > 0.58) {
      const arcBlend = clamp((blink - 0.58) / 0.42, 0, 1);
      const halfW = lerp(34, 43, arcBlend) * sc;
      const archLift = lerp(10, 28, arcBlend) * sc;
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 16 * sc;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - halfW, cy + 5 * sc);
      ctx.quadraticCurveTo(cx, cy - archLift, cx + halfW, cy + 5 * sc);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const squashY = lerp(1.0, 0.22, clamp(blink / 0.58, 0, 1));
    const stretchX = lerp(1.0, 1.18, clamp(blink / 0.58, 0, 1));

    ctx.translate(cx, cy);
    ctx.scale(stretchX, squashY);

    if (style === 'classic_pills' && emotion !== 'hype' && emotion !== 'cry') {
      // Authentic Roblox Classic/Modern Guest vertical rounded pill eyes!
      const pillW = (emotion === 'surprised' ? 34 : 28) * sc;
      const pillH = (emotion === 'surprised' ? 68 : 60) * sc;
      const r = Math.min(pillW, pillH);
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.moveTo(-pillW + r, -pillH);
      ctx.lineTo(pillW - r, -pillH);
      ctx.quadraticCurveTo(pillW, -pillH, pillW, -pillH + r);
      ctx.lineTo(pillW, pillH - r);
      ctx.quadraticCurveTo(pillW, pillH, pillW - r, pillH);
      ctx.lineTo(-pillW + r, pillH);
      ctx.quadraticCurveTo(-pillW, pillH, -pillW, pillH - r);
      ctx.lineTo(-pillW, -pillH + r);
      ctx.quadraticCurveTo(-pillW, -pillH, -pillW + r, -pillH);
      ctx.closePath();
      ctx.fill();

      if (emotion === 'surprised') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-9 * sc, -22 * sc, 9 * sc, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (style === 'anime_sparkle' && emotion !== 'hype' && emotion !== 'cry') {
      // Glossy expressive VTuber Anime eyes with iris + dual highlights!
      const rx = 38 * sc;
      const ry = (emotion === 'surprised' ? 54 : 48) * sc;

      // Dark outer lash oval
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();

      // Colored iris lower crescent
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(0, 0, rx - 5 * sc, ry - 5 * sc, 0, 0, Math.PI * 2);
      ctx.clip();
      const irisGrad = ctx.createLinearGradient(0, -ry, 0, ry);
      irisGrad.addColorStop(0, '#0f172a');
      irisGrad.addColorStop(0.45, eyeColor === '#0c0c0c' || eyeColor === '#111318' ? '#2563eb' : eyeColor);
      irisGrad.addColorStop(1, '#93c5fd');
      ctx.fillStyle = irisGrad;
      ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
      // Dark pupil
      ctx.fillStyle = '#0b1020';
      ctx.beginPath();
      ctx.ellipse(0, -2 * sc, rx * 0.44, ry * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Dual anime sparkle catchlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(-12 * sc, -17 * sc, 11 * sc, 13 * sc, -0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(13 * sc, 16 * sc, 6.5 * sc, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Baby Noob bold iconic circular dot eye (also base for hype/cry)
      let radius = 32 * sc;
      if (emotion === 'surprised' || emotion === 'hype' || emotion === 'cry') {
        radius = 39 * sc;
      }

      ctx.fillStyle = emotion === 'hype' || emotion === 'cry' ? '#0c0c0c' : eyeColor;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();

      if (emotion === 'hype') {
        const pulse = 0.92 + Math.sin(time * 9.0 + (isLeft ? 0 : 1.1)) * 0.12;
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.rotate(Math.sin(time * 3.5) * 0.1);
        this.drawFourPointStar(ctx, 0, -2 * sc, 24 * sc, 9 * sc, '#ffe766');
        this.drawFourPointStar(ctx, 0, -2 * sc, 14 * sc, 5.5 * sc, '#ffffff');
        ctx.restore();
      } else if (emotion === 'surprised') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-11 * sc, -11 * sc, 9 * sc, 0, Math.PI * 2);
        ctx.fill();
      } else if (emotion === 'cry') {
        const wobble = Math.sin(time * 10 + (isLeft ? 0 : 1.5)) * 2.5 * sc;
        ctx.fillStyle = '#e0f7ff';
        ctx.beginPath();
        ctx.arc(-11 * sc, -11 * sc + wobble * 0.3, 11.5 * sc, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#9be7ff';
        ctx.beginPath();
        ctx.arc(11 * sc, 12 * sc - wobble * 0.3, 7.5 * sc, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // Post-transform overlays for Cry, Sleepy, Angry (works identically across ALL face styles!)
    if (emotion === 'cry') {
      ctx.save();
      const tearGrad = ctx.createLinearGradient(cx, cy + 20 * sc, cx, cy + 125 * sc);
      tearGrad.addColorStop(0, 'rgba(130, 224, 255, 0.92)');
      tearGrad.addColorStop(1, 'rgba(65, 178, 255, 0.72)');
      ctx.fillStyle = tearGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 34 * sc, 36 * sc, 14 * sc, 0, 0, Math.PI * 2);
      ctx.fill();

      const dropT = (time * 1.15 + (isLeft ? 0 : 0.45)) % 1.0;
      const dropY = cy + 40 * sc + dropT * 92 * sc;
      const dropAlpha = Math.sin(dropT * Math.PI);
      const dropX = cx + (isLeft ? -14 : 14) * sc;
      ctx.fillStyle = `rgba(115, 215, 255, ${0.9 * dropAlpha})`;
      ctx.beginPath();
      ctx.moveTo(dropX, dropY - 18 * sc);
      ctx.quadraticCurveTo(dropX + 14 * sc, dropY + 4 * sc, dropX, dropY + 14 * sc);
      ctx.quadraticCurveTo(dropX - 14 * sc, dropY + 4 * sc, dropX, dropY - 18 * sc);
      ctx.fill();
      ctx.restore();
    } else if (emotion === 'sleepy') {
      ctx.save();
      const droop = Math.sin(time * 2.2) * 3 * sc;
      ctx.fillStyle = skinColor;
      ctx.fillRect(cx - 52 * sc, cy - 72 * sc, 104 * sc, 72 * sc + droop);
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 12 * sc;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 40 * sc, cy + droop);
      ctx.quadraticCurveTo(cx, cy + 8 * sc + droop, cx + 40 * sc, cy + droop);
      ctx.stroke();
      ctx.restore();
    } else if (emotion === 'angry') {
      ctx.save();
      ctx.fillStyle = skinColor;
      ctx.beginPath();
      if (isLeft) {
        ctx.moveTo(cx - 50 * sc, cy - 52 * sc);
        ctx.lineTo(cx + 50 * sc, cy - 18 * sc);
        ctx.lineTo(cx + 50 * sc, cy - 78 * sc);
        ctx.lineTo(cx - 50 * sc, cy - 78 * sc);
      } else {
        ctx.moveTo(cx - 50 * sc, cy - 18 * sc);
        ctx.lineTo(cx + 50 * sc, cy - 52 * sc);
        ctx.lineTo(cx + 50 * sc, cy - 78 * sc);
        ctx.lineTo(cx - 50 * sc, cy - 78 * sc);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
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
    layout: FaceLayout,
    state: FaceRenderState,
    style: Exclude<FaceStyleId, 'auto'>,
    ox: number,
    oy: number,
  ): void {
    const sc = layout.scale;
    const showAngry = state.emotion === 'angry' || state.browDown > 0.45;
    const showSurprised = state.emotion === 'surprised' || state.browUp > 0.45;
    const showCry = state.emotion === 'cry';
    const showAnimeBrows = style === 'anime_sparkle' && !showAngry && !showSurprised && !showCry;

    if (!showAngry && !showSurprised && !showCry && !showAnimeBrows) return;

    ctx.save();
    ctx.strokeStyle = '#0c0c0c';
    ctx.lineWidth = (showAnimeBrows ? 9 : 14) * sc;
    ctx.lineCap = 'round';

    const lx = layout.leftEyeX + ox;
    const rx = layout.rightEyeX + ox;
    const by = layout.eyeY - (style === 'classic_pills' ? 76 : 62) * sc + oy;

    if (showAngry) {
      const strength = state.emotion === 'angry' ? 1.0 : clamp((state.browDown - 0.35) / 0.65, 0, 1);
      const tilt = 22 * sc * strength;
      ctx.beginPath();
      ctx.moveTo(lx - 42 * sc, by - tilt * 0.5 + 18 * sc);
      ctx.lineTo(lx + 42 * sc, by + tilt + 18 * sc);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx - 42 * sc, by + tilt + 18 * sc);
      ctx.lineTo(rx + 42 * sc, by - tilt * 0.5 + 18 * sc);
      ctx.stroke();
    } else if (showCry) {
      ctx.lineWidth = 12 * sc;
      ctx.beginPath();
      ctx.moveTo(lx - 38 * sc, by + 12 * sc);
      ctx.quadraticCurveTo(lx + 4 * sc, by + 4 * sc, lx + 34 * sc, by - 12 * sc);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx + 38 * sc, by + 12 * sc);
      ctx.quadraticCurveTo(rx - 4 * sc, by + 4 * sc, rx - 34 * sc, by - 12 * sc);
      ctx.stroke();
    } else if (showSurprised) {
      const lift = (state.emotion === 'surprised' ? 1 : state.browUp) * 18 * sc;
      ctx.lineWidth = 12 * sc;
      ctx.beginPath();
      ctx.moveTo(lx - 34 * sc, by - lift);
      ctx.quadraticCurveTo(lx, by - 22 * sc - lift, lx + 34 * sc, by - lift);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx - 34 * sc, by - lift);
      ctx.quadraticCurveTo(rx, by - 22 * sc - lift, rx + 34 * sc, by - lift);
      ctx.stroke();
    } else if (showAnimeBrows) {
      ctx.beginPath();
      ctx.moveTo(lx - 30 * sc, by - 4 * sc);
      ctx.quadraticCurveTo(lx, by - 16 * sc, lx + 30 * sc, by - 4 * sc);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rx - 30 * sc, by - 4 * sc);
      ctx.quadraticCurveTo(rx, by - 16 * sc, rx + 30 * sc, by - 4 * sc);
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawMouth(
    ctx: CanvasRenderingContext2D,
    layout: FaceLayout,
    state: FaceRenderState,
    style: Exclude<FaceStyleId, 'auto'>,
    ox: number,
    oy: number,
  ): void {
    const sc = layout.scale;
    const shiftX = clamp(state.mouthShiftX, -1, 1) * 38 * sc;
    const mx = layout.mouthX + ox + shiftX;
    const my = layout.mouthBaseY + oy;
    const open = clamp(state.mouthOpen, 0, 1);
    const round = clamp(state.mouthRound, 0, 1);
    const widthNorm = clamp(state.mouthWidth, 0.42, 1.35);
    const smile = clamp(state.mouthSmile, -1, 1);
    const skew = clamp(state.mouthSkew, -1, 1);
    const tongueColor = state.mouthColor;
    const cavityColor = darkenHex(state.mouthColor, 0.78);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // === FULL REAL-TIME WEBCAM MOUTH MIRRORING ===
    // Directly mirrors open/close, width/pucker, smile/frown, horizontal jaw shift, and asymmetric smirk!
    if (state.isFullMouthTracked) {
      if (open < 0.075) {
        // Closed lips: pucker kiss vs live flexible smile/neutral/frown/smirk line
        if (round > 0.62) {
          // Cute closed pucker / kissy mouth
          ctx.strokeStyle = '#0c0c0c';
          ctx.lineWidth = 15 * sc;
          ctx.beginPath();
          ctx.moveTo(mx - 24 * sc, my + 32 * sc);
          ctx.quadraticCurveTo(mx + 14 * sc, my + 42 * sc, mx - 12 * sc, my + 54 * sc);
          ctx.quadraticCurveTo(mx + 16 * sc, my + 66 * sc, mx - 22 * sc, my + 74 * sc);
          ctx.stroke();
          ctx.restore();
          return;
        }

        const halfW = 92 * widthNorm * sc;
        const baseY = my + 52 * sc;
        const smileCurve = smile * 64 * sc; // +smile pulls center DOWN / corners UP; -frown pulls corners DOWN
        const skewLift = skew * 24 * sc;
        const leftCornerY = baseY - smileCurve * 0.48 + skewLift;
        const rightCornerY = baseY - smileCurve * 0.48 - skewLift;
        const midControlY = baseY + smileCurve * 0.72;

        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = (style === 'classic_pills' ? 22 : 16) * sc;
        ctx.beginPath();
        ctx.moveTo(mx - halfW, leftCornerY);
        ctx.quadraticCurveTo(mx, midControlY, mx + halfW, rightCornerY);
        ctx.stroke();
        ctx.restore();
        return;
      }

      // Open Pucker / Funnel ('O' / 'U' / whistle / kiss-open)
      if (round > 0.56 || widthNorm < 0.66) {
        const rx = clamp(lerp(28, 76, widthNorm * 0.65 + open * 0.35), 24, 80) * sc;
        const ry = clamp(lerp(24, 86, open), 22, 90) * sc;
        this.drawRoundOMouth(ctx, mx, my + 58 * sc, rx, ry, cavityColor, tongueColor, sc);
        ctx.restore();
        return;
      }

      // Open Talking / Smiling / Frowning / Smirking / Laughing Mouth!
      const halfW = clamp(lerp(66, 126, open * 0.45 + 0.35) * widthNorm, 48, 148) * sc;
      const topCenterY = my + lerp(36, 4, open) * sc;
      const skewLift = skew * 20 * sc;
      // Smile lifts corners above topCenter; frown drops corners below topCenter!
      const cornerDeltaY = -smile * 28 * sc;
      const leftCornerY = topCenterY + cornerDeltaY + skewLift;
      const rightCornerY = topCenterY + cornerDeltaY - skewLift;
      const topMidControlY = topCenterY + (smile >= 0 ? lerp(8, 28, smile * open) : smile * 34) * sc;
      const bottomY = topCenterY + lerp(34, 174, open) * sc;

      const traceTrackedMouth = () => {
        ctx.beginPath();
        ctx.moveTo(mx - halfW, leftCornerY);
        ctx.quadraticCurveTo(mx, topMidControlY, mx + halfW, rightCornerY);
        ctx.bezierCurveTo(
          mx + halfW * 1.02,
          lerp(rightCornerY, bottomY, 0.62),
          mx + halfW * 0.56,
          bottomY,
          mx,
          bottomY,
        );
        ctx.bezierCurveTo(
          mx - halfW * 0.56,
          bottomY,
          mx - halfW * 1.02,
          lerp(leftCornerY, bottomY, 0.62),
          mx - halfW,
          leftCornerY,
        );
        ctx.closePath();
      };

      ctx.save();
      traceTrackedMouth();
      ctx.fillStyle = cavityColor;
      ctx.fill();
      ctx.clip();

      const tongueTopY = lerp(topCenterY + 12 * sc, bottomY, 0.34);
      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.ellipse(
        mx,
        bottomY + 14 * sc,
        halfW * 1.08,
        Math.max(22 * sc, bottomY - tongueTopY + 18 * sc),
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();

      traceTrackedMouth();
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = 16 * sc;
      ctx.stroke();

      ctx.restore();
      return;
    }

    // === EMOTION / IDLE / PURE AUDIO LIP-SYNC MODE ===
    // Special emotion resting mouths when not talking loudly
    if (!state.isLipSyncActive || open < 0.08) {
      if (state.emotion === 'blush' && open < 0.15) {
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 15 * sc;
        ctx.beginPath();
        ctx.moveTo(mx - 64 * sc, my + 32 * sc);
        ctx.quadraticCurveTo(mx - 32 * sc, my + 68 * sc, mx, my + 36 * sc);
        ctx.quadraticCurveTo(mx + 32 * sc, my + 68 * sc, mx + 64 * sc, my + 32 * sc);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'angry' && open < 0.16) {
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 16 * sc;
        ctx.beginPath();
        ctx.moveTo(mx - 70 * sc, my + 72 * sc);
        ctx.quadraticCurveTo(mx, my + 24 * sc, mx + 70 * sc, my + 72 * sc);
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'cry' && open < 0.16) {
        const wob = Math.sin(state.time * 12) * 5 * sc;
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 15 * sc;
        ctx.beginPath();
        ctx.moveTo(mx - 70 * sc, my + 74 * sc);
        ctx.bezierCurveTo(
          mx - 26 * sc,
          my + 26 * sc + wob,
          mx + 26 * sc,
          my + 26 * sc - wob,
          mx + 70 * sc,
          my + 74 * sc,
        );
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'sleepy' && open < 0.15) {
        const breathe = Math.sin(state.time * 2.2) * 5 * sc;
        ctx.fillStyle = tongueColor;
        ctx.strokeStyle = '#0c0c0c';
        ctx.lineWidth = 14 * sc;
        ctx.beginPath();
        ctx.ellipse(mx, my + 58 * sc, (26 + breathe * 0.4) * sc, (22 + breathe) * sc, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        return;
      }

      if (state.emotion === 'surprised' && open < 0.25) {
        this.drawRoundOMouth(ctx, mx, my + 64 * sc, 48 * sc, 60 * sc, cavityColor, tongueColor, sc);
        ctx.restore();
        return;
      }

      if (style === 'classic_pills' && (state.emotion === 'happy' || state.emotion === 'wink') && open < 0.08) {
        const halfW = (state.characterId === 'modern_guest' ? 124 : 138) * sc;
        const depth = (state.characterId === 'modern_guest' ? 105 : 96) * sc;
        ctx.strokeStyle = '#111318';
        ctx.lineWidth = 28 * sc;
        ctx.beginPath();
        ctx.moveTo(mx - halfW, my + 24 * sc);
        ctx.quadraticCurveTo(mx, my + 24 * sc + depth, mx + halfW, my + 24 * sc);
        ctx.stroke();
        ctx.restore();
        return;
      }
    }

    let effOpen = open;
    if (!state.isLipSyncActive) {
      if (state.emotion === 'happy' || state.emotion === 'wink') {
        effOpen = style === 'classic_pills' ? 0.0 : 0.86;
      } else if (state.emotion === 'hype') {
        effOpen = 1.0;
      }
    }

    if (effOpen < 0.08) {
      const smileLift = (state.emotion === 'angry' || state.emotion === 'cry' ? -18 : style === 'classic_pills' ? 76 : 30) * sc;
      const halfW = lerp(74, style === 'classic_pills' ? 124 : 96, clamp((smile + 1) * 0.5, 0, 1)) * sc;
      ctx.strokeStyle = '#0c0c0c';
      ctx.lineWidth = (style === 'classic_pills' ? 24 : 15) * sc;
      ctx.beginPath();
      ctx.moveTo(mx - halfW, my + 34 * sc);
      ctx.quadraticCurveTo(mx, my + 34 * sc + smileLift, mx + halfW, my + 34 * sc);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (round > 0.55 || (state.emotion === 'surprised' && effOpen > 0.2)) {
      const rMix = state.emotion === 'surprised' ? 0.85 : round;
      const rx = lerp(42, 62, effOpen) * lerp(1.15, 0.82, rMix) * sc;
      const ry = lerp(30, 74, effOpen) * sc;
      this.drawRoundOMouth(ctx, mx, my + 56 * sc, rx, ry, cavityColor, tongueColor, sc);
      ctx.restore();
      return;
    }

    const smileFactor =
      state.emotion === 'angry' || state.emotion === 'cry'
        ? -0.35
        : clamp(smile, -0.4, 1);

    const halfW =
      lerp(74, 114, clamp(effOpen * 0.75 + 0.25, 0, 1)) *
      lerp(0.84, 1.05, (smileFactor + 1) * 0.5) *
      sc;
    const topEdgeY = my + lerp(24, -4, effOpen) * sc;
    const topDip = lerp(10, 22, effOpen) * (smileFactor >= 0 ? 1 : -0.6) * sc;
    const bottomY = topEdgeY + lerp(44, 166, effOpen) * sc;

    const traceMouthPath = () => {
      ctx.beginPath();
      ctx.moveTo(mx - halfW, topEdgeY);
      ctx.quadraticCurveTo(mx, topEdgeY + topDip, mx + halfW, topEdgeY);
      ctx.bezierCurveTo(
        mx + halfW * 1.02,
        lerp(topEdgeY, bottomY, 0.62),
        mx + halfW * 0.54,
        bottomY,
        mx,
        bottomY,
      );
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

    ctx.save();
    traceMouthPath();
    ctx.fillStyle = cavityColor;
    ctx.fill();
    ctx.clip();

    const tongueTopY = lerp(topEdgeY + topDip + 8 * sc, bottomY, 0.28);
    ctx.fillStyle = tongueColor;
    ctx.beginPath();
    ctx.ellipse(
      mx,
      bottomY + 14 * sc,
      halfW * 1.08,
      Math.max(24 * sc, bottomY - tongueTopY + 18 * sc),
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    traceMouthPath();
    ctx.strokeStyle = '#0c0c0c';
    ctx.lineWidth = 16 * sc;
    ctx.stroke();

    ctx.restore();
  }

  private drawRoundOMouth(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    cavityColor: string,
    tongueColor: string,
    sc: number,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = cavityColor;
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = tongueColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + ry * 0.52, rx * 0.95, ry * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#0c0c0c';
    ctx.lineWidth = 15 * sc;
    ctx.stroke();
  }

  public dispose(): void {
    this.texture.dispose();
  }
}
