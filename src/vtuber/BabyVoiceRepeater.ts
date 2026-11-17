import type { RepeaterPhase, RepeaterStateSnapshot } from '../types/vtuber';
import type { LipSyncSample } from './AudioLipSync';

const WORKLET_CODE = `
class BabyRepeaterCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage(new Float32Array(input[0]));
    }
    return true;
  }
}
registerProcessor('baby-repeater-capture', BabyRepeaterCaptureProcessor);
`;

const MAX_RECORD_SECONDS = 12;
const SILENCE_FINISH_MS = 820;
const MIN_PHRASE_SECONDS = 0.22;
const PRE_ROLL_SECONDS = 0.28;
const POST_SPEAK_COOLDOWN_MS = 450;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export class BabyVoiceRepeater {
  private audioCtx: AudioContext | null = null;
  private workletRegistered = false;
  private stream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private captureNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private silentSink: GainNode | null = null;
  private playbackAnalyser: AnalyserNode | null = null;
  private activePlaybackSource: AudioBufferSourceNode | null = null;

  private pbTimeData: Uint8Array | null = null;
  private pbFreqData: Uint8Array | null = null;

  private phase: RepeaterPhase = 'idle';
  private autoListen = true;
  private babyPitch = 1.54;
  private vadThreshold = 0.022;
  private error: string | null = null;

  // Capture buffers
  private preRollChunks: Float32Array[] = [];
  private preRollSamples = 0;
  private recordedChunks: Float32Array[] = [];
  private recordedSamples = 0;
  private speechStreakMs = 0;
  private silenceMs = 0;
  private cooldownUntil = 0;
  private manualRecording = false;

  // Last recorded clean AudioBuffer (for instant replay or pitch tweaking!)
  private lastPhraseBuffer: AudioBuffer | null = null;

  // Smoothed meters & playback lip-sync
  private smoothInputLevel = 0;
  private smoothOpen = 0;
  private smoothRound = 0;
  private smoothLevel = 0;

  private onStateChange?: (snap: RepeaterStateSnapshot) => void;
  private lastEmitTs = 0;

  public setStateListener(cb: ((snap: RepeaterStateSnapshot) => void) | undefined): void {
    this.onStateChange = cb;
  }

  public configure(opts: { babyPitch: number; autoListen: boolean; threshold: number }): void {
    this.babyPitch = clamp(opts.babyPitch, 1.15, 2.0);
    this.autoListen = opts.autoListen;
    this.vadThreshold = clamp(opts.threshold, 0.008, 0.12);
    if (this.phase !== 'idle') {
      this.emitState(true);
    }
  }

  public getPhase(): RepeaterPhase {
    return this.phase;
  }

  public isActive(): boolean {
    return this.phase !== 'idle' && this.phase !== 'error';
  }

  public isSpeaking(): boolean {
    return this.phase === 'speaking';
  }

  public isListeningOrRecording(): boolean {
    return this.phase === 'listening' || this.phase === 'recording';
  }

  public hasRecording(): boolean {
    return this.lastPhraseBuffer !== null;
  }

  public getSnapshot(): RepeaterStateSnapshot {
    const sr = this.audioCtx?.sampleRate ?? 48000;
    return {
      phase: this.phase,
      autoListen: this.autoListen,
      hasRecording: this.lastPhraseBuffer !== null,
      recordSeconds: this.phase === 'recording' ? this.recordedSamples / sr : 0,
      inputLevel: this.smoothInputLevel,
      error: this.error,
    };
  }

  private emitState(force = false): void {
    if (!this.onStateChange) return;
    const now = performance.now();
    if (!force && now - this.lastEmitTs < 75) return;
    this.lastEmitTs = now;
    this.onStateChange(this.getSnapshot());
  }

  private async ensureAudioGraph(): Promise<void> {
    if (this.audioCtx && this.stream && this.captureNode) {
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Браузер не поддерживает запись с микрофона (нужен HTTPS)');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    let ctx = this.audioCtx;
    if (!ctx || ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AudioCtx();
      this.audioCtx = ctx;
      this.workletRegistered = false;
      this.playbackAnalyser = null;
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const micSource = ctx.createMediaStreamSource(stream);
    const silentSink = ctx.createGain();
    silentSink.gain.value = 0;
    silentSink.connect(ctx.destination);

    // Playback analyser for live baby-voice lip-sync
    if (!this.playbackAnalyser) {
      const pbAnalyser = ctx.createAnalyser();
      pbAnalyser.fftSize = 512;
      pbAnalyser.smoothingTimeConstant = 0.35;
      this.playbackAnalyser = pbAnalyser;
      this.pbTimeData = new Uint8Array(pbAnalyser.fftSize);
      this.pbFreqData = new Uint8Array(pbAnalyser.frequencyBinCount);
    }

    let captureNode: AudioWorkletNode | ScriptProcessorNode;
    if (ctx.audioWorklet && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      try {
        if (!this.workletRegistered) {
          const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
          const url = URL.createObjectURL(blob);
          try {
            await ctx.audioWorklet.addModule(url);
            this.workletRegistered = true;
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        const worklet = new AudioWorkletNode(ctx, 'baby-repeater-capture', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          channelCount: 1,
        });
        worklet.port.onmessage = (ev: MessageEvent<Float32Array>) => {
          if (ev.data && ev.data.length > 0) {
            this.handleAudioChunk(ev.data);
          }
        };
        micSource.connect(worklet);
        worklet.connect(silentSink);
        captureNode = worklet;
      } catch {
        captureNode = this.attachScriptProcessor(ctx, micSource, silentSink);
      }
    } else {
      captureNode = this.attachScriptProcessor(ctx, micSource, silentSink);
    }

    this.stream = stream;
    this.micSource = micSource;
    this.captureNode = captureNode;
    this.silentSink = silentSink;
  }

  private attachScriptProcessor(
    ctx: AudioContext,
    micSource: MediaStreamAudioSourceNode,
    silentSink: GainNode,
  ): ScriptProcessorNode {
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = (ev) => {
      const ch = ev.inputBuffer.getChannelData(0);
      if (ch && ch.length > 0) {
        this.handleAudioChunk(new Float32Array(ch));
      }
    };
    micSource.connect(proc);
    proc.connect(silentSink);
    return proc;
  }

  public async startListening(): Promise<void> {
    this.error = null;
    try {
      await this.ensureAudioGraph();
    } catch (err) {
      this.error =
        err instanceof Error
          ? err.message
          : 'Нет доступа к микрофону. Проверь разрешения браузера.';
      this.phase = 'error';
      this.emitState(true);
      throw err;
    }

    this.stopCurrentPlayback();
    this.resetBuffers();
    this.manualRecording = false;
    this.phase = 'listening';
    this.cooldownUntil = performance.now() + 180;
    this.emitState(true);
  }

  public async startManualRecording(): Promise<void> {
    this.error = null;
    try {
      await this.ensureAudioGraph();
    } catch (err) {
      this.error =
        err instanceof Error
          ? err.message
          : 'Нет доступа к микрофону. Проверь разрешения браузера.';
      this.phase = 'error';
      this.emitState(true);
      throw err;
    }

    this.stopCurrentPlayback();
    this.resetBuffers();
    this.manualRecording = true;
    this.phase = 'recording';
    this.emitState(true);
  }

  public finishRecordingNow(): void {
    if (this.phase !== 'recording') return;
    this.manualRecording = false;
    this.finalizeAndSpeak();
  }

  public async replayLast(): Promise<boolean> {
    if (!this.lastPhraseBuffer) return false;
    if (!this.audioCtx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (!this.playbackAnalyser) {
      this.playbackAnalyser = this.audioCtx.createAnalyser();
      this.playbackAnalyser.fftSize = 512;
      this.playbackAnalyser.smoothingTimeConstant = 0.35;
      this.pbTimeData = new Uint8Array(this.playbackAnalyser.fftSize);
      this.pbFreqData = new Uint8Array(this.playbackAnalyser.frequencyBinCount);
    }

    const wasListening = this.isActive() && this.stream !== null;
    this.playBufferAsBaby(this.lastPhraseBuffer, wasListening);
    return true;
  }

  public stop(): void {
    this.stopCurrentPlayback();
    this.manualRecording = false;
    this.phase = 'idle';
    this.error = null;
    this.smoothInputLevel = 0;
    this.smoothOpen = 0;
    this.smoothRound = 0;
    this.smoothLevel = 0;
    this.resetBuffers();

    if (this.captureNode) {
      try {
        this.captureNode.disconnect();
      } catch {
        // ignore
      }
      this.captureNode = null;
    }
    if (this.micSource) {
      try {
        this.micSource.disconnect();
      } catch {
        // ignore
      }
      this.micSource = null;
    }
    if (this.silentSink) {
      try {
        this.silentSink.disconnect();
      } catch {
        // ignore
      }
      this.silentSink = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    // Keep audioCtx & lastPhraseBuffer alive so user can still hit "Replay" cleanly after stopping mic!
    this.emitState(true);
  }

  public dispose(): void {
    this.stop();
    if (this.audioCtx) {
      void this.audioCtx.close();
      this.audioCtx = null;
      this.workletRegistered = false;
    }
    this.playbackAnalyser = null;
    this.pbTimeData = null;
    this.pbFreqData = null;
    this.lastPhraseBuffer = null;
  }

  private resetBuffers(): void {
    this.preRollChunks = [];
    this.preRollSamples = 0;
    this.recordedChunks = [];
    this.recordedSamples = 0;
    this.speechStreakMs = 0;
    this.silenceMs = 0;
  }

  private stopCurrentPlayback(): void {
    if (this.activePlaybackSource) {
      try {
        this.activePlaybackSource.onended = null;
        this.activePlaybackSource.stop();
        this.activePlaybackSource.disconnect();
      } catch {
        // ignore already stopped
      }
      this.activePlaybackSource = null;
    }
  }

  private handleAudioChunk(chunk: Float32Array): void {
    if (this.phase !== 'listening' && this.phase !== 'recording') return;
    const now = performance.now();
    if (this.phase === 'listening' && now < this.cooldownUntil) {
      this.smoothInputLevel *= 0.85;
      return;
    }

    const sr = this.audioCtx?.sampleRate ?? 48000;
    const chunkMs = (chunk.length / sr) * 1000;

    // RMS calculation
    let sumSq = 0;
    for (let i = 0; i < chunk.length; i++) {
      const s = chunk[i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / chunk.length);
    const visualLvl = clamp((rms - 0.004) * 9.5, 0, 1);
    this.smoothInputLevel = this.smoothInputLevel * 0.65 + visualLvl * 0.35;

    if (this.phase === 'listening') {
      // Maintain rolling pre-roll ring buffer so first consonant/syllable is never cut off!
      this.preRollChunks.push(chunk);
      this.preRollSamples += chunk.length;
      const maxPreSamples = Math.floor(sr * PRE_ROLL_SECONDS);
      while (this.preRollSamples > maxPreSamples && this.preRollChunks.length > 1) {
        const dropped = this.preRollChunks.shift()!;
        this.preRollSamples -= dropped.length;
      }

      if (this.autoListen && rms >= this.vadThreshold) {
        this.speechStreakMs += chunkMs;
        if (this.speechStreakMs >= 65) {
          // Speech started! Promote pre-roll into recording buffer
          this.recordedChunks = [...this.preRollChunks];
          this.recordedSamples = this.preRollSamples;
          this.preRollChunks = [];
          this.preRollSamples = 0;
          this.silenceMs = 0;
          this.phase = 'recording';
          this.emitState(true);
        }
      } else {
        this.speechStreakMs = Math.max(0, this.speechStreakMs - chunkMs * 1.5);
        this.emitState(false);
      }
      return;
    }

    // phase === 'recording'
    this.recordedChunks.push(chunk);
    this.recordedSamples += chunk.length;

    const recordedSec = this.recordedSamples / sr;
    const holdThreshold = this.vadThreshold * 0.68;

    if (rms >= holdThreshold) {
      this.silenceMs = 0;
    } else {
      this.silenceMs += chunkMs;
    }

    if (recordedSec >= MAX_RECORD_SECONDS || (!this.manualRecording && this.silenceMs >= SILENCE_FINISH_MS)) {
      this.manualRecording = false;
      this.finalizeAndSpeak();
      return;
    }

    this.emitState(false);
  }

  private finalizeAndSpeak(): void {
    const ctx = this.audioCtx;
    if (!ctx || this.recordedSamples === 0) {
      this.phase = this.stream ? 'listening' : 'idle';
      this.resetBuffers();
      this.emitState(true);
      return;
    }

    const sr = ctx.sampleRate;
    const total = this.recordedSamples;
    const raw = new Float32Array(total);
    let offset = 0;
    for (const c of this.recordedChunks) {
      raw.set(c, offset);
      offset += c.length;
    }
    this.resetBuffers();

    // Trim leading & trailing silence cleanly
    const trimThresh = Math.max(0.008, this.vadThreshold * 0.45);
    let startIdx = 0;
    while (startIdx < total && Math.abs(raw[startIdx]) < trimThresh) startIdx++;
    let endIdx = total - 1;
    while (endIdx > startIdx && Math.abs(raw[endIdx]) < trimThresh) endIdx--;

    const padStart = Math.floor(sr * 0.07);
    const padEnd = Math.floor(sr * 0.11);
    startIdx = Math.max(0, startIdx - padStart);
    endIdx = Math.min(total - 1, endIdx + padEnd);

    const len = endIdx - startIdx + 1;
    if (len < sr * MIN_PHRASE_SECONDS) {
      // Too short (accidental click/bump) -> stay listening cleanly
      this.phase = this.stream ? 'listening' : 'idle';
      this.emitState(true);
      return;
    }

    // Peak-normalize & apply gentle cosine fades (zero clicks, crisp loudness!)
    let peak = 0;
    for (let i = startIdx; i <= endIdx; i++) {
      const a = Math.abs(raw[i]);
      if (a > peak) peak = a;
    }
    if (peak < 0.006) {
      this.phase = this.stream ? 'listening' : 'idle';
      this.emitState(true);
      return;
    }

    const normGain = Math.min(7.5, 0.86 / peak);
    const buffer = ctx.createBuffer(1, len, sr);
    const out = buffer.getChannelData(0);
    const fadeInSamples = Math.min(Math.floor(sr * 0.02), Math.floor(len * 0.15));
    const fadeOutSamples = Math.min(Math.floor(sr * 0.045), Math.floor(len * 0.25));

    for (let i = 0; i < len; i++) {
      let s = raw[startIdx + i] * normGain;
      if (i < fadeInSamples) {
        s *= 0.5 * (1 - Math.cos((Math.PI * i) / fadeInSamples));
      } else if (i > len - fadeOutSamples) {
        const rem = len - 1 - i;
        s *= 0.5 * (1 - Math.cos((Math.PI * rem) / fadeOutSamples));
      }
      out[i] = clamp(s, -0.98, 0.98);
    }

    this.lastPhraseBuffer = buffer;
    this.playBufferAsBaby(buffer, this.stream !== null);
  }

  private playBufferAsBaby(buffer: AudioBuffer, returnToListening: boolean): void {
    const ctx = this.audioCtx;
    if (!ctx) return;

    this.stopCurrentPlayback();

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Raising playbackRate shifts BOTH pitch and vocal-tract formants upward -> genuine adorable baby voice!
    src.playbackRate.value = this.babyPitch;

    // Baby vocal tract formant sculpting chain:
    // 1. High-pass strips adult chest rumble
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 195;
    hp.Q.value = 0.7;

    // 2. Cute bright baby vowel warmth
    const babyFormant = ctx.createBiquadFilter();
    babyFormant.type = 'peaking';
    babyFormant.frequency.value = 1280;
    babyFormant.Q.value = 1.0;
    babyFormant.gain.value = 3.6;

    // 3. Crisp consonant intelligibility
    const clarity = ctx.createBiquadFilter();
    clarity.type = 'peaking';
    clarity.frequency.value = 3400;
    clarity.Q.value = 1.2;
    clarity.gain.value = 2.6;

    // 4. Soft high-frequency smoothing (prevents harsh hiss after pitching up)
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 8200;
    lp.Q.value = 0.7;

    // 5. Studio loudness polish
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;

    const outGain = ctx.createGain();
    outGain.gain.value = 1.15;

    src.connect(hp);
    hp.connect(babyFormant);
    babyFormant.connect(clarity);
    clarity.connect(lp);
    lp.connect(comp);
    comp.connect(outGain);
    outGain.connect(ctx.destination);

    if (this.playbackAnalyser) {
      outGain.connect(this.playbackAnalyser);
    }

    this.activePlaybackSource = src;
    this.phase = 'speaking';
    this.smoothInputLevel = 0;
    this.emitState(true);

    src.onended = () => {
      if (this.activePlaybackSource === src) {
        this.activePlaybackSource = null;
      }
      this.cooldownUntil = performance.now() + POST_SPEAK_COOLDOWN_MS;
      this.resetBuffers();
      this.phase = returnToListening && this.stream ? 'listening' : 'idle';
      this.emitState(true);
    };

    src.start(0);
  }

  /**
   * Samples live baby-voice playback audio so Baby Noob / Guests animate their mouth
   * in exact real-time sync with every syllable they repeat!
   */
  public samplePlayback(dt: number): LipSyncSample {
    const emptySpectrum = new Array<number>(16).fill(0);
    if (this.phase !== 'speaking' || !this.playbackAnalyser || !this.pbTimeData || !this.pbFreqData) {
      this.smoothOpen *= Math.exp(-16 * dt);
      this.smoothLevel *= Math.exp(-16 * dt);
      this.smoothRound *= Math.exp(-12 * dt);
      return {
        audioLevel: this.smoothLevel,
        mouthOpen: this.smoothOpen,
        mouthRound: this.smoothRound,
        isTalking: false,
        spectrum: emptySpectrum,
      };
    }

    this.playbackAnalyser.getByteTimeDomainData(this.pbTimeData);
    this.playbackAnalyser.getByteFrequencyData(this.pbFreqData);

    let sumSq = 0;
    for (let i = 0; i < this.pbTimeData.length; i++) {
      const n = (this.pbTimeData[i] - 128) / 128;
      sumSq += n * n;
    }
    const rms = Math.sqrt(sumSq / this.pbTimeData.length);
    const rawLevel = clamp((rms - 0.01) * 5.8, 0, 1);

    // Shifted formant bands (baby voice has higher fundamental & formants!)
    let lowEnergy = 0;
    for (let i = 3; i <= 14; i++) lowEnergy += this.pbFreqData[i];
    lowEnergy /= 12;

    let highEnergy = 0;
    for (let i = 15; i <= 48; i++) highEnergy += this.pbFreqData[i];
    highEnergy /= 34;

    const total = lowEnergy + highEnergy + 1;
    const targetRound = clamp((lowEnergy / total - 0.46) * 3.0, 0, 1);

    const openRate = rawLevel > this.smoothOpen ? 30 : 18;
    this.smoothOpen += (rawLevel - this.smoothOpen) * (1 - Math.exp(-openRate * dt));
    this.smoothLevel += (rawLevel - this.smoothLevel) * (1 - Math.exp(-22 * dt));
    this.smoothRound += (targetRound - this.smoothRound) * (1 - Math.exp(-14 * dt));

    const spectrum = new Array<number>(16);
    for (let b = 0; b < 16; b++) {
      const start = 2 + b * 3;
      const avg = (this.pbFreqData[start] + this.pbFreqData[start + 1] + this.pbFreqData[start + 2]) / 765;
      spectrum[b] = clamp(avg * 1.35, 0, 1);
    }

    return {
      audioLevel: this.smoothLevel,
      mouthOpen: clamp(this.smoothOpen * 1.12, 0, 1),
      mouthRound: this.smoothRound,
      isTalking: this.smoothLevel > 0.05 || this.phase === 'speaking',
      spectrum,
    };
  }
}
