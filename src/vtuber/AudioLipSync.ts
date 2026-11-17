export interface LipSyncSample {
  audioLevel: number; // 0..1
  mouthOpen: number; // 0..1
  mouthRound: number; // 0..1 (higher = O/U, lower = A/E)
  isTalking: boolean;
  spectrum: number[]; // 16 normalized bars 0..1
}

export class AudioLipSync {
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private timeData: Uint8Array | null = null;
  private freqData: Uint8Array | null = null;
  private active = false;
  private smoothOpen = 0;
  private smoothRound = 0;
  private smoothLevel = 0;

  public async start(): Promise<void> {
    if (this.active) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Браузер не поддерживает доступ к микрофону (требуется HTTPS)');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.45;
    source.connect(analyser);

    this.stream = stream;
    this.audioCtx = ctx;
    this.analyser = analyser;
    this.timeData = new Uint8Array(analyser.fftSize);
    this.freqData = new Uint8Array(analyser.frequencyBinCount);
    this.active = true;
  }

  public stop(): void {
    this.active = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
    }
    this.analyser = null;
    this.timeData = null;
    this.freqData = null;
    this.smoothOpen = 0;
    this.smoothRound = 0;
    this.smoothLevel = 0;
  }

  public isActive(): boolean {
    return this.active;
  }

  public setMutedPaused(paused: boolean): void {
    if (!this.audioCtx || this.audioCtx.state === 'closed') return;
    if (paused && this.audioCtx.state === 'running') {
      void this.audioCtx.suspend();
    } else if (!paused && this.active && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume();
    }
  }

  public sample(gain: number, dt: number): LipSyncSample {
    const emptySpectrum = new Array<number>(16).fill(0);
    if (!this.active || !this.analyser || !this.timeData || !this.freqData) {
      return {
        audioLevel: 0,
        mouthOpen: 0,
        mouthRound: 0,
        isTalking: false,
        spectrum: emptySpectrum,
      };
    }

    this.analyser.getByteTimeDomainData(this.timeData);
    this.analyser.getByteFrequencyData(this.freqData);

    // RMS amplitude from waveform
    let sumSq = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const n = (this.timeData[i] - 128) / 128;
      sumSq += n * n;
    }
    const rms = Math.sqrt(sumSq / this.timeData.length);
    const noiseGate = 0.014;
    const gated = Math.max(0, rms - noiseGate);
    const rawLevel = Math.min(1, gated * 7.2 * gain);

    // Formant ratio: low-mid speech energy (bins 2..10 ~ 170-860Hz) vs bright energy (bins 11..38 ~ 950-3200Hz)
    let lowEnergy = 0;
    for (let i = 2; i <= 10; i++) lowEnergy += this.freqData[i];
    lowEnergy /= 9;

    let highEnergy = 0;
    for (let i = 11; i <= 36; i++) highEnergy += this.freqData[i];
    highEnergy /= 26;

    const totalEnergy = lowEnergy + highEnergy + 1;
    // Higher low-to-total ratio implies rounded O/U vowel; higher highEnergy implies open A/E vowel
    const targetRound = Math.max(0, Math.min(1, (lowEnergy / totalEnergy - 0.44) * 3.2));

    // Fast attack, smooth natural release
    const openRate = rawLevel > this.smoothOpen ? 24 : 14;
    const openAlpha = 1 - Math.exp(-openRate * dt);
    this.smoothOpen += (rawLevel - this.smoothOpen) * openAlpha;
    this.smoothLevel += (rawLevel - this.smoothLevel) * (1 - Math.exp(-18 * dt));
    this.smoothRound += (targetRound - this.smoothRound) * (1 - Math.exp(-12 * dt));

    // 16-bar compact equalizer for Studio panel
    const spectrum = new Array<number>(16);
    for (let b = 0; b < 16; b++) {
      const start = 1 + b * 2;
      const avg = (this.freqData[start] + this.freqData[start + 1]) / 510;
      spectrum[b] = Math.min(1, avg * Math.max(0.8, gain * 0.9));
    }

    return {
      audioLevel: this.smoothLevel,
      mouthOpen: this.smoothOpen,
      mouthRound: this.smoothRound,
      isTalking: this.smoothOpen > 0.09,
      spectrum,
    };
  }
}

/**
 * Generates realistic lively VTuber speech syllables + head nods for instant "Demo Speech" preview
 * without requiring webcam or microphone permissions.
 */
export function sampleDemoSpeech(time: number): {
  mouthOpen: number;
  mouthRound: number;
  isTalking: boolean;
  audioLevel: number;
  headNod: number;
  headYaw: number;
  headRoll: number;
  spectrum: number[];
} {
  // Phrase cadence: talks for ~2.6s, brief breath pause ~0.65s
  const phraseCycle = time % 3.25;
  const speakingEnvelope =
    phraseCycle < 2.6
      ? Math.min(1, phraseCycle * 6) * Math.min(1, (2.6 - phraseCycle) * 5)
      : 0;

  // Multi-harmonic syllable envelope (4–7 syllables/sec)
  const syl1 = Math.max(0, Math.sin(time * 13.5));
  const syl2 = Math.max(0, Math.sin(time * 8.3 + 1.2));
  const syl3 = 0.5 + 0.5 * Math.sin(time * 21.0 + 0.5);
  const raw = speakingEnvelope * (0.18 + 0.82 * (syl1 * 0.55 + syl2 * 0.3 + syl3 * 0.15));

  const mouthOpen = Math.min(1, raw * 1.05);
  const mouthRound = 0.5 + 0.45 * Math.sin(time * 4.7 + Math.cos(time * 2.1));

  // Lively conversational head gestures synchronized with phrase rhythm
  const headYaw = Math.sin(time * 1.4) * 0.24 + Math.sin(time * 2.9) * 0.08;
  const headNod = Math.sin(time * 3.8) * 0.07 * speakingEnvelope - 0.04;
  const headRoll = Math.sin(time * 1.9 + 0.8) * 0.14;

  const spectrum = new Array<number>(16);
  for (let i = 0; i < 16; i++) {
    const bell = Math.exp(-Math.pow((i - 5.5) / 4.8, 2));
    const jitter = 0.65 + 0.35 * Math.sin(time * (14 + i * 2.7) + i);
    spectrum[i] = Math.min(1, mouthOpen * bell * jitter * 1.15);
  }

  return {
    mouthOpen,
    mouthRound,
    isTalking: mouthOpen > 0.12,
    audioLevel: mouthOpen,
    headNod,
    headYaw,
    headRoll,
    spectrum,
  };
}
