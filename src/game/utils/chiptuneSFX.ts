/**
 * ChiptuneSFX - 8-bit Sound Effects Manager
 *
 * Provides retro 8-bit chiptune sound effects for the Pokemon catching game.
 * Uses Web Audio API to synthesize sounds programmatically (no audio files needed).
 *
 * Sound Design Philosophy:
 * - Retro 8-bit / chiptune-adjacent, short and snappy
 * - Very dry (little or no reverb) so they sit cleanly under the music
 * - Target length: 150-500ms, max 700ms for win fanfare
 *
 * Available SFX:
 * - throwStart: Light whoosh + flick when ball leaves hand
 * - ballImpact: Soft thunk + bounce when ball hits Pokemon
 * - catchSuccess: Victory fanfare with sparkle
 * - catchFail: Short downward "womp"
 */

// ============================================================
// CONFIGURATION
// ============================================================

const SFX_CONFIG = {
  /** Master SFX volume (0-1), 70-80% relative to music */
  MASTER_VOLUME: 0.75,

  /** Individual sound durations (ms) */
  THROW_DURATION: 200,
  IMPACT_DURATION: 250,
  WIN_DURATION: 600,
  FAIL_DURATION: 350,

  /** Note frequencies (Hz) for common notes */
  NOTES: {
    C4: 261.63,
    D4: 293.66,
    E4: 329.63,
    F4: 349.23,
    G4: 392.00,
    A4: 440.00,
    B4: 493.88,
    C5: 523.25,
    D5: 587.33,
    E5: 659.25,
    G5: 783.99,
    // Lower notes for bass/thump
    C2: 65.41,
    E2: 82.41,
    G2: 98.00,
    C3: 130.81,
    E3: 164.81,
    G3: 196.00,
  },
} as const;

// ============================================================
// CHIPTUNE SFX CLASS
// ============================================================

export class ChiptuneSFX {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = SFX_CONFIG.MASTER_VOLUME;

  constructor() {
    this.initAudioContext();
  }

  /**
   * Initialize the Web Audio API context.
   * Called lazily on first sound play if not already initialized.
   */
  private initAudioContext(): void {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.audioContext.destination);
    } catch (e) {
      console.warn('[ChiptuneSFX] Web Audio API not supported:', e);
    }
  }

  /**
   * Ensure audio context is ready (resume if suspended).
   * Required for browsers that suspend AudioContext until user interaction.
   */
  private async ensureAudioReady(): Promise<boolean> {
    if (!this.audioContext) {
      this.initAudioContext();
    }
    if (!this.audioContext || !this.masterGain) {
      return false;
    }
    if (this.audioContext.state === 'suspended') {
      try {
        await this.audioContext.resume();
      } catch (e) {
        console.warn('[ChiptuneSFX] Failed to resume audio context:', e);
        return false;
      }
    }
    return true;
  }

  // ============================================================
  // SOUND SYNTHESIS HELPERS
  // ============================================================

  /**
   * Create an oscillator with envelope.
   * @param type - Oscillator type (square, triangle, sawtooth, sine)
   * @param frequency - Starting frequency in Hz
   * @param duration - Duration in seconds
   * @param volume - Volume 0-1
   * @param attack - Attack time in seconds
   * @param decay - Decay time in seconds
   */
  private createTone(
    type: OscillatorType,
    frequency: number,
    duration: number,
    volume: number = 0.3,
    attack: number = 0.01,
    decay: number = 0.05
  ): { oscillator: OscillatorNode; gainNode: GainNode } | null {
    if (!this.audioContext || !this.masterGain) return null;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.value = frequency;

    // ADSR envelope: instant attack, short decay, no sustain, tiny release
    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(volume, now + attack);
    gainNode.gain.linearRampToValueAtTime(volume * 0.7, now + attack + decay);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    return { oscillator, gainNode };
  }

  /**
   * Create a noise burst (for clicks, impacts, sparkle).
   * @param duration - Duration in seconds
   * @param volume - Volume 0-1
   * @param highpass - Highpass filter frequency (higher = more "clicky")
   */
  private createNoise(
    duration: number,
    volume: number = 0.2,
    highpass: number = 2000
  ): { source: AudioBufferSourceNode; gainNode: GainNode } | null {
    if (!this.audioContext || !this.masterGain) return null;

    // Create white noise buffer
    const bufferSize = this.audioContext.sampleRate * duration;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;

    // Highpass filter for "clicky" sound
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;

    const gainNode = this.audioContext.createGain();
    const now = this.audioContext.currentTime;
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain);

    return { source, gainNode };
  }

  /**
   * Play a pitch sweep (for whoosh effects).
   * @param startFreq - Starting frequency
   * @param endFreq - Ending frequency
   * @param duration - Duration in seconds
   * @param type - Oscillator type
   * @param volume - Volume 0-1
   */
  private playSweep(
    startFreq: number,
    endFreq: number,
    duration: number,
    type: OscillatorType = 'square',
    volume: number = 0.2
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.type = type;
    const now = this.audioContext.currentTime;

    oscillator.frequency.setValueAtTime(startFreq, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, now + duration);

    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.linearRampToValueAtTime(0, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.masterGain);

    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  // ============================================================
  // PUBLIC SFX METHODS
  // ============================================================

  /**
   * Play throw start sound.
   * Vibe: Light 8-bit whoosh + flick, like a wrist snap.
   * Trigger: When throw animation begins (button click).
   */
  async playThrowStart(): Promise<void> {
    if (this.isMuted || !(await this.ensureAudioReady())) return;
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;

    // Click layer at the start (button press feel)
    const click = this.createNoise(0.02, 0.15, 4000);
    if (click) {
      click.source.start(now);
    }

    // Quick upward pitch blip 1
    const tone1 = this.createTone('square', 800, 0.06, 0.2, 0.005, 0.02);
    if (tone1) {
      tone1.oscillator.frequency.setValueAtTime(800, now);
      tone1.oscillator.frequency.exponentialRampToValueAtTime(1600, now + 0.05);
      tone1.oscillator.start(now);
      tone1.oscillator.stop(now + 0.06);
    }

    // Quick upward pitch blip 2 (slightly delayed)
    const tone2 = this.createTone('square', 1200, 0.05, 0.15, 0.005, 0.02);
    if (tone2) {
      tone2.oscillator.frequency.setValueAtTime(1200, now + 0.03);
      tone2.oscillator.frequency.exponentialRampToValueAtTime(2000, now + 0.08);
      tone2.oscillator.start(now + 0.03);
      tone2.oscillator.stop(now + 0.1);
    }

    // Subtle whoosh layer (noise sweep)
    const whoosh = this.createNoise(0.12, 0.08, 1500);
    if (whoosh) {
      whoosh.source.start(now);
    }
  }

  /**
   * Play ball impact/bounce sound.
   * Vibe: Soft thunk + tiny bounce, like rubber on grass.
   * Trigger: When ball reaches Pokemon / start of wobble.
   */
  async playBallImpact(): Promise<void> {
    if (this.isMuted || !(await this.ensureAudioReady())) return;
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;

    // Low-mid thump (first note, lower)
    const thump = this.createTone('triangle', 120, 0.1, 0.35, 0.005, 0.04);
    if (thump) {
      thump.oscillator.frequency.setValueAtTime(120, now);
      thump.oscillator.frequency.exponentialRampToValueAtTime(60, now + 0.08);
      thump.oscillator.start(now);
      thump.oscillator.stop(now + 0.1);
    }

    // Higher blip right after (bounce, slightly higher and quieter)
    const bounce = this.createTone('square', 400, 0.06, 0.2, 0.005, 0.02);
    if (bounce) {
      bounce.oscillator.start(now + 0.08);
      bounce.oscillator.stop(now + 0.15);
    }

    // Soft impact noise
    const impact = this.createNoise(0.05, 0.1, 800);
    if (impact) {
      impact.source.start(now);
    }
  }

  /**
   * Play catch success fanfare.
   * Vibe: Small victory fanfare, sparkly but not overwhelming.
   * 3-4 note ascending arpeggio in major key (do-mi-so-do).
   * Trigger: When catch result is success.
   */
  async playCatchSuccess(): Promise<void> {
    if (this.isMuted || !(await this.ensureAudioReady())) return;
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;
    const { C4, E4, G4, C5 } = SFX_CONFIG.NOTES;

    // Ascending arpeggio: C4 -> E4 -> G4 -> C5
    const notes = [
      { freq: C4, time: 0, duration: 0.15 },
      { freq: E4, time: 0.1, duration: 0.15 },
      { freq: G4, time: 0.2, duration: 0.15 },
      { freq: C5, time: 0.3, duration: 0.25 },
    ];

    // Play each note with square wave (bright 8-bit sound)
    notes.forEach(({ freq, time, duration }) => {
      const tone = this.createTone('square', freq, duration, 0.25, 0.01, 0.03);
      if (tone) {
        tone.oscillator.start(now + time);
        tone.oscillator.stop(now + time + duration);
      }
    });

    // Add subtle triangle harmony on the final note
    const harmony = this.createTone('triangle', C5 * 1.5, 0.2, 0.12, 0.01, 0.05);
    if (harmony) {
      harmony.oscillator.start(now + 0.35);
      harmony.oscillator.stop(now + 0.55);
    }

    // Sparkle noise layer
    const sparkle = this.createNoise(0.3, 0.06, 6000);
    if (sparkle) {
      sparkle.source.start(now + 0.2);
    }

    // Second sparkle burst
    const sparkle2 = this.createNoise(0.15, 0.04, 8000);
    if (sparkle2) {
      sparkle2.source.start(now + 0.4);
    }
  }

  /**
   * Play catch fail/escape sound.
   * Vibe: Short downward "womp" that says "aww, miss" but not harsh.
   * 2-3 note descending motif (so-mi-do).
   * Trigger: When catch result is failure (escape).
   */
  async playCatchFail(): Promise<void> {
    if (this.isMuted || !(await this.ensureAudioReady())) return;
    if (!this.audioContext || !this.masterGain) return;

    const now = this.audioContext.currentTime;
    const { G3, E3, C3 } = SFX_CONFIG.NOTES;

    // Descending motif: G3 -> E3 -> C3 (duller than win)
    const notes = [
      { freq: G3, time: 0, duration: 0.12 },
      { freq: E3, time: 0.1, duration: 0.12 },
      { freq: C3, time: 0.2, duration: 0.18 },
    ];

    // Play with triangle wave (softer, duller than success)
    notes.forEach(({ freq, time, duration }) => {
      const tone = this.createTone('triangle', freq, duration, 0.25, 0.01, 0.04);
      if (tone) {
        tone.oscillator.start(now + time);
        tone.oscillator.stop(now + time + duration);
      }
    });

    // Single downward pitch glide overlay
    this.playSweep(300, 100, 0.25, 'triangle', 0.15);
  }

  // ============================================================
  // VOLUME & MUTE CONTROLS
  // ============================================================

  /**
   * Set SFX volume (0-1).
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
    }
  }

  /**
   * Get current volume.
   */
  getVolume(): number {
    return this.volume;
  }

  /**
   * Mute all SFX.
   */
  mute(): void {
    this.isMuted = true;
    if (this.masterGain) {
      this.masterGain.gain.value = 0;
    }
  }

  /**
   * Unmute SFX.
   */
  unmute(): void {
    this.isMuted = false;
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  /**
   * Toggle mute state.
   */
  toggleMute(): boolean {
    if (this.isMuted) {
      this.unmute();
    } else {
      this.mute();
    }
    return this.isMuted;
  }

  /**
   * Check if muted.
   */
  isSfxMuted(): boolean {
    return this.isMuted;
  }

  // ============================================================
  // CLEANUP
  // ============================================================

  /**
   * Clean up audio resources.
   */
  destroy(): void {
    if (this.masterGain) {
      this.masterGain.disconnect();
      this.masterGain = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// ============================================================
// SINGLETON INSTANCE
// ============================================================

let sfxInstance: ChiptuneSFX | null = null;

/**
 * Get the singleton ChiptuneSFX instance.
 * Creates instance on first call.
 */
export function getChiptuneSFX(): ChiptuneSFX {
  if (!sfxInstance) {
    sfxInstance = new ChiptuneSFX();
  }
  return sfxInstance;
}

/**
 * Destroy the singleton instance (for cleanup).
 */
export function destroyChiptuneSFX(): void {
  if (sfxInstance) {
    sfxInstance.destroy();
    sfxInstance = null;
  }
}

// Export config for external reference
export { SFX_CONFIG };
