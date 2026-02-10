// Song data structure
interface SongData {
  name: string;
  tempo: number;
  melody: Array<{ note: number; duration: number }>;
  bassLine: Array<{ note: number; duration: number }>;
}

// 8-bit chiptune music generator using Web Audio API
export class ChiptuneMusic {
  private audioContext: AudioContext | null = null;
  private oscillatorNodes: OscillatorNode[] = [];
  private gainNode: GainNode | null = null;
  private isPlaying = false;
  private isSwitching = false; // Flag to prevent overlapping songs
  private currentNoteIndex = 0;
  private currentBassIndex = 0;
  private currentSong: SongData | null = null;
  private songIndex = 0;
  private melodyTimeout?: number;
  private bassTimeout?: number;
  private melodyLoopCount = 0;
  private bassLoopCount = 0;
  private activeOscillators: Set<OscillatorNode> = new Set();

  // 8-bit remixes of modern rap songs
  private songs: SongData[] = [
    {
      name: "Bike Mode (Fast 8-bit)",
      tempo: 180, // Faster tempo for bike mode
      melody: [
        // Fast-paced energetic melody
        { note: 493.88, duration: 0.125 }, // B4
        { note: 523.25, duration: 0.125 }, // C5
        { note: 587.33, duration: 0.125 }, // D5
        { note: 659.25, duration: 0.125 }, // E5
        { note: 587.33, duration: 0.125 }, // D5
        { note: 523.25, duration: 0.125 }, // C5
        { note: 493.88, duration: 0.125 }, // B4
        { note: 440.00, duration: 0.125 }, // A4
        { note: 392.00, duration: 0.25 }, // G4
        { note: 440.00, duration: 0.25 }, // A4
        { note: 493.88, duration: 0.25 }, // B4
        { note: 523.25, duration: 0.25 }, // C5
        { note: 587.33, duration: 0.5 }, // D5
        { note: 0, duration: 0.25 }, // Rest
      ],
      bassLine: [
        { note: 123.47, duration: 0.25 }, // B2
        { note: 130.81, duration: 0.25 }, // C3
        { note: 146.83, duration: 0.25 }, // D3
        { note: 164.81, duration: 0.25 }, // E3
        { note: 146.83, duration: 0.25 }, // D3
        { note: 130.81, duration: 0.25 }, // C3
        { note: 123.47, duration: 0.25 }, // B2
        { note: 110.00, duration: 0.25 }, // A2
        { note: 98.00, duration: 0.5 }, // G2
        { note: 110.00, duration: 0.5 }, // A2
        { note: 123.47, duration: 0.5 }, // B2
        { note: 130.81, duration: 0.5 }, // C3
        { note: 146.83, duration: 1.0 }, // D3
        { note: 0, duration: 0.25 }, // Rest
      ],
    },
    {
      name: "Sicko Mode (8-bit)",
      tempo: 140,
      melody: [
        // Main hook melody
        { note: 392.00, duration: 0.25 }, // G4
        { note: 440.00, duration: 0.25 }, // A4
        { note: 493.88, duration: 0.5 }, // B4
        { note: 440.00, duration: 0.25 }, // A4
        { note: 392.00, duration: 0.25 }, // G4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 261.63, duration: 0.5 }, // C4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 392.00, duration: 0.5 }, // G4
        { note: 0, duration: 0.5 }, // Rest
      ],
      bassLine: [
        { note: 98.00, duration: 0.5 }, // G2
        { note: 110.00, duration: 0.5 }, // A2
        { note: 123.47, duration: 0.5 }, // B2
        { note: 110.00, duration: 0.5 }, // A2
        { note: 98.00, duration: 0.5 }, // G2
        { note: 87.31, duration: 0.5 }, // F2
        { note: 82.41, duration: 0.5 }, // E2
        { note: 73.42, duration: 0.5 }, // D2
        { note: 65.41, duration: 0.5 }, // C2
        { note: 73.42, duration: 0.5 }, // D2
        { note: 82.41, duration: 0.5 }, // E2
        { note: 87.31, duration: 0.5 }, // F2
        { note: 98.00, duration: 0.5 }, // G2
        { note: 0, duration: 0.5 }, // Rest
      ],
    },
    {
      name: "God's Plan (8-bit)",
      tempo: 78,
      melody: [
        // Iconic hook melody
        { note: 261.63, duration: 0.5 }, // C4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 392.00, duration: 0.75 }, // G4
        { note: 349.23, duration: 0.25 }, // F4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 261.63, duration: 0.5 }, // C4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 392.00, duration: 1.0 }, // G4
        { note: 0, duration: 0.5 }, // Rest
      ],
      bassLine: [
        { note: 130.81, duration: 1.0 }, // C3
        { note: 146.83, duration: 1.0 }, // D3
        { note: 164.81, duration: 1.0 }, // E3
        { note: 174.61, duration: 1.0 }, // F3
        { note: 196.00, duration: 1.5 }, // G3
        { note: 174.61, duration: 0.5 }, // F3
        { note: 164.81, duration: 1.0 }, // E3
        { note: 146.83, duration: 1.0 }, // D3
        { note: 130.81, duration: 1.0 }, // C3
        { note: 146.83, duration: 1.0 }, // D3
        { note: 164.81, duration: 1.0 }, // E3
        { note: 174.61, duration: 1.0 }, // F3
        { note: 196.00, duration: 2.0 }, // G3
        { note: 0, duration: 0.5 }, // Rest
      ],
    },
    {
      name: "The Box (8-bit)",
      tempo: 150,
      melody: [
        // Distinctive melody
        { note: 311.13, duration: 0.25 }, // D#4
        { note: 329.63, duration: 0.25 }, // E4
        { note: 349.23, duration: 0.25 }, // F4
        { note: 369.99, duration: 0.25 }, // F#4
        { note: 392.00, duration: 0.5 }, // G4
        { note: 369.99, duration: 0.25 }, // F#4
        { note: 349.23, duration: 0.25 }, // F4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 311.13, duration: 0.5 }, // D#4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 311.13, duration: 0.5 }, // D#4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 0, duration: 0.5 }, // Rest
      ],
      bassLine: [
        // Deep bass pattern
        { note: 77.78, duration: 0.25 }, // D#2
        { note: 82.41, duration: 0.25 }, // E2
        { note: 87.31, duration: 0.25 }, // F2
        { note: 92.50, duration: 0.25 }, // F#2
        { note: 98.00, duration: 0.5 }, // G2
        { note: 92.50, duration: 0.25 }, // F#2
        { note: 87.31, duration: 0.25 }, // F2
        { note: 82.41, duration: 0.5 }, // E2
        { note: 77.78, duration: 0.5 }, // D#2
        { note: 73.42, duration: 0.5 }, // D2
        { note: 77.78, duration: 0.5 }, // D#2
        { note: 82.41, duration: 0.5 }, // E2
        { note: 87.31, duration: 0.5 }, // F2
        { note: 0, duration: 0.5 }, // Rest
      ],
    },
    {
      name: "In Da Club (8-bit)",
      tempo: 140,
      melody: [
        // Classic 50 Cent melody
        { note: 392.00, duration: 0.25 }, // G4
        { note: 440.00, duration: 0.25 }, // A4
        { note: 392.00, duration: 0.25 }, // G4
        { note: 349.23, duration: 0.25 }, // F4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 261.63, duration: 0.5 }, // C4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 392.00, duration: 0.5 }, // G4
        { note: 440.00, duration: 0.5 }, // A4
        { note: 392.00, duration: 0.5 }, // G4
        { note: 0, duration: 0.5 }, // Rest
      ],
      bassLine: [
        { note: 98.00, duration: 0.5 }, // G2
        { note: 110.00, duration: 0.5 }, // A2
        { note: 98.00, duration: 0.5 }, // G2
        { note: 87.31, duration: 0.5 }, // F2
        { note: 82.41, duration: 1.0 }, // E2
        { note: 73.42, duration: 1.0 }, // D2
        { note: 65.41, duration: 1.0 }, // C2
        { note: 73.42, duration: 1.0 }, // D2
        { note: 82.41, duration: 1.0 }, // E2
        { note: 87.31, duration: 1.0 }, // F2
        { note: 98.00, duration: 1.0 }, // G2
        { note: 110.00, duration: 1.0 }, // A2
        { note: 98.00, duration: 1.0 }, // G2
        { note: 0, duration: 0.5 }, // Rest
      ],
    },
    {
      name: "Lose Yourself (8-bit)",
      tempo: 171,
      melody: [
        // Iconic Eminem melody
        { note: 329.63, duration: 0.25 }, // E4
        { note: 349.23, duration: 0.25 }, // F4
        { note: 392.00, duration: 0.5 }, // G4
        { note: 440.00, duration: 0.5 }, // A4
        { note: 392.00, duration: 0.5 }, // G4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 261.63, duration: 0.5 }, // C4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 392.00, duration: 1.0 }, // G4
        { note: 0, duration: 0.5 }, // Rest
      ],
      bassLine: [
        { note: 82.41, duration: 0.5 }, // E2
        { note: 87.31, duration: 0.5 }, // F2
        { note: 98.00, duration: 1.0 }, // G2
        { note: 110.00, duration: 1.0 }, // A2
        { note: 98.00, duration: 1.0 }, // G2
        { note: 87.31, duration: 1.0 }, // F2
        { note: 82.41, duration: 1.0 }, // E2
        { note: 73.42, duration: 1.0 }, // D2
        { note: 65.41, duration: 1.0 }, // C2
        { note: 73.42, duration: 1.0 }, // D2
        { note: 82.41, duration: 1.0 }, // E2
        { note: 87.31, duration: 1.0 }, // F2
        { note: 98.00, duration: 2.0 }, // G2
        { note: 0, duration: 0.5 }, // Rest
      ],
    },
    {
      name: "Mo Bamba (8-bit)",
      tempo: 150,
      melody: [
        // Catchy hook melody
        { note: 349.23, duration: 0.25 }, // F4
        { note: 392.00, duration: 0.25 }, // G4
        { note: 440.00, duration: 0.25 }, // A4
        { note: 392.00, duration: 0.25 }, // G4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 261.63, duration: 0.5 }, // C4
        { note: 293.66, duration: 0.5 }, // D4
        { note: 329.63, duration: 0.5 }, // E4
        { note: 349.23, duration: 0.5 }, // F4
        { note: 392.00, duration: 0.5 }, // G4
        { note: 440.00, duration: 0.5 }, // A4
        { note: 0, duration: 0.5 }, // Rest
      ],
      bassLine: [
        { note: 87.31, duration: 0.5 }, // F2
        { note: 98.00, duration: 0.5 }, // G2
        { note: 110.00, duration: 0.5 }, // A2
        { note: 98.00, duration: 0.5 }, // G2
        { note: 87.31, duration: 1.0 }, // F2
        { note: 82.41, duration: 1.0 }, // E2
        { note: 73.42, duration: 1.0 }, // D2
        { note: 65.41, duration: 1.0 }, // C2
        { note: 73.42, duration: 1.0 }, // D2
        { note: 82.41, duration: 1.0 }, // E2
        { note: 87.31, duration: 1.0 }, // F2
        { note: 98.00, duration: 1.0 }, // G2
        { note: 110.00, duration: 1.0 }, // A2
        { note: 0, duration: 0.5 }, // Rest
      ],
    },
  ];

  constructor() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
    // Start with a random song
    this.selectRandomSong();
  }

  private selectRandomSong(): void {
    this.songIndex = Math.floor(Math.random() * this.songs.length);
    this.currentSong = this.songs[this.songIndex];
  }

  play(): void {
    // Initialize audio context if needed
    if (!this.audioContext) {
      try {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported');
        return;
      }
    }
    
    // Don't play if already playing
    if (this.isPlaying) return;

    // Select a random song if none is selected
    if (!this.currentSong) {
      this.selectRandomSong();
    }

    this.isPlaying = true;
    this.isSwitching = false;
    this.currentNoteIndex = 0;
    this.currentBassIndex = 0;
    this.melodyLoopCount = 0;
    this.bassLoopCount = 0;

    // Create master gain node for volume control
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.value = 0.3; // 30% volume
    this.gainNode.connect(this.audioContext.destination);

    this.playMelody();
    this.playBass();
  }

  private playMelody(): void {
    if (!this.audioContext || !this.gainNode || !this.currentSong || this.isSwitching || !this.isPlaying) return;

    const loopsPerSong = 4; // Play each song 4 times before switching

    const playNote = (index: number) => {
      // Check isPlaying FIRST before doing anything
      if (!this.isPlaying || this.isSwitching || !this.audioContext || !this.gainNode || !this.currentSong) {
        return;
      }

      const noteData = this.currentSong.melody[index % this.currentSong.melody.length];
      const nextIndex = (index + 1) % this.currentSong.melody.length;
      const isLoopComplete = nextIndex === 0;

      if (noteData.note > 0) {
        // Create oscillator for melody (square wave for 8-bit sound)
        const oscillator = this.audioContext.createOscillator();
        const noteGain = this.audioContext.createGain();

        oscillator.type = 'square';
        oscillator.frequency.value = noteData.note;

        noteGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        noteGain.gain.linearRampToValueAtTime(0.15, this.audioContext.currentTime + 0.01);
        noteGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + noteData.duration);

        oscillator.connect(noteGain);
        noteGain.connect(this.gainNode);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + noteData.duration);
        
        // Track active oscillators
        this.activeOscillators.add(oscillator);
        oscillator.onended = () => {
          this.activeOscillators.delete(oscillator);
        };
      }

      // Schedule next note
      const delay = (noteData.duration * 60) / this.currentSong.tempo;
      this.melodyTimeout = window.setTimeout(() => {
        if (this.isPlaying && !this.isSwitching) {
          if (isLoopComplete) {
            this.melodyLoopCount++;
            if (this.melodyLoopCount >= loopsPerSong) {
              // Signal that melody is ready to switch
              this.checkAndSwitchSong();
              return; // Don't continue playing
            }
          }
          this.currentNoteIndex = nextIndex;
          playNote(nextIndex);
        }
      }, delay * 1000);
    };

    playNote(0);
  }

  private playBass(): void {
    if (!this.audioContext || !this.gainNode || !this.currentSong || this.isSwitching || !this.isPlaying) return;

    const loopsPerSong = 4; // Play each song 4 times before switching

    const playBassNote = (index: number) => {
      // Check isPlaying FIRST before doing anything
      if (!this.isPlaying || this.isSwitching || !this.audioContext || !this.gainNode || !this.currentSong) {
        return;
      }

      const noteData = this.currentSong.bassLine[index % this.currentSong.bassLine.length];
      const nextIndex = (index + 1) % this.currentSong.bassLine.length;
      const isLoopComplete = nextIndex === 0;

      if (noteData.note > 0) {
        // Create oscillator for bass (triangle wave for smoother bass)
        const oscillator = this.audioContext.createOscillator();
        const noteGain = this.audioContext.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.value = noteData.note;

        noteGain.gain.setValueAtTime(0, this.audioContext.currentTime);
        noteGain.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.01);
        noteGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + noteData.duration);

        oscillator.connect(noteGain);
        noteGain.connect(this.gainNode);

        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + noteData.duration);
        
        // Track active oscillators
        this.activeOscillators.add(oscillator);
        oscillator.onended = () => {
          this.activeOscillators.delete(oscillator);
        };
      }

      // Schedule next note
      const delay = (noteData.duration * 60) / this.currentSong.tempo;
      this.bassTimeout = window.setTimeout(() => {
        if (this.isPlaying && !this.isSwitching) {
          if (isLoopComplete) {
            this.bassLoopCount++;
            if (this.bassLoopCount >= loopsPerSong) {
              // Signal that bass is ready to switch
              this.checkAndSwitchSong();
              return; // Don't continue playing
            }
          }
          this.currentBassIndex = nextIndex;
          playBassNote(nextIndex);
        }
      }, delay * 1000);
    };

    playBassNote(0);
  }

  private checkAndSwitchSong(): void {
    // Only switch if we're not already switching and both parts have completed
    if (this.isSwitching) return;
    
    // Check if both melody and bass have completed their loops (4 loops each)
    if (this.melodyLoopCount >= 4 && this.bassLoopCount >= 4) {
      this.performSongSwitch();
    }
  }

  private performSongSwitch(): void {
    // Prevent any new notes from being scheduled
    this.isSwitching = true;
    
    // Clear all timeouts immediately
    if (this.melodyTimeout) {
      clearTimeout(this.melodyTimeout);
      this.melodyTimeout = undefined;
    }
    if (this.bassTimeout) {
      clearTimeout(this.bassTimeout);
      this.bassTimeout = undefined;
    }
    
    // Stop all active oscillators
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
      } catch (e) {
        // Oscillator already stopped
      }
    });
    this.activeOscillators.clear();
    
    // Fade out current gain node
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.2);
    }
    
    // Wait for fade out and oscillator cleanup, then switch songs
    setTimeout(() => {
      if (this.isPlaying && this.audioContext) {
        // Disconnect old gain node
        if (this.gainNode) {
          this.gainNode.disconnect();
          this.gainNode = null;
        }
        
        // Select new song
        this.selectRandomSong();
        this.currentNoteIndex = 0;
        this.currentBassIndex = 0;
        this.melodyLoopCount = 0;
        this.bassLoopCount = 0;
        
        // Create new gain node for new song
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = 0.3;
        this.gainNode.connect(this.audioContext.destination);
        
        this.isSwitching = false;
        
        // Restart both melody and bass together
        this.playMelody();
        this.playBass();
      }
    }, 400); // Pause to ensure clean transition
  }

  stop(): void {
    // Set flags first to prevent any new notes from playing
    this.isPlaying = false;
    this.isSwitching = true; // Prevent any scheduled notes from playing
    
    // Clear timeouts immediately
    if (this.melodyTimeout) {
      clearTimeout(this.melodyTimeout);
      this.melodyTimeout = undefined;
    }
    if (this.bassTimeout) {
      clearTimeout(this.bassTimeout);
      this.bassTimeout = undefined;
    }
    
    // Stop all active oscillators
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
      } catch (e) {
        // Oscillator already stopped
      }
    });
    this.activeOscillators.clear();
    
    if (this.oscillatorNodes.length > 0) {
      this.oscillatorNodes.forEach(node => {
        try {
          node.stop();
        } catch (e) {
          // Node already stopped
        }
      });
      this.oscillatorNodes = [];
    }

    // Fade out and disconnect gain node
    if (this.gainNode && this.audioContext) {
      try {
        this.gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
        setTimeout(() => {
          if (this.gainNode) {
            this.gainNode.disconnect();
            this.gainNode = null;
          }
        }, 150);
      } catch (e) {
        // If fade fails, just disconnect
        this.gainNode.disconnect();
        this.gainNode = null;
      }
    }
    
    // Reset switching flag after a brief delay to ensure cleanup
    setTimeout(() => {
      this.isSwitching = false;
    }, 200);
  }

  getCurrentSongName(): string {
    return this.currentSong?.name || 'No song';
  }

  isMusicPlaying(): boolean {
    return this.isPlaying;
  }

  toggle(): void {
    if (this.isPlaying) {
      this.stop();
    } else {
      // Make sure audio context is ready
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      this.play();
    }
  }

  nextSong(): void {
    this.stop();
    this.songIndex = (this.songIndex + 1) % this.songs.length;
    this.currentSong = this.songs[this.songIndex];
    setTimeout(() => {
      this.play();
    }, 100);
  }

  switchToSong(songName: string): void {
    const songIndex = this.songs.findIndex(song => song.name === songName);
    if (songIndex !== -1) {
      const wasPlaying = this.isPlaying;
      this.stop();
      this.songIndex = songIndex;
      this.currentSong = this.songs[this.songIndex];
      // Only play if music was playing before
      if (wasPlaying) {
        setTimeout(() => {
          this.play();
        }, 100);
      }
    }
  }

  switchToBikeMode(): void {
    // Only switch if music is currently playing
    if (this.isPlaying) {
      this.switchToSong('Bike Mode (Fast 8-bit)');
    }
  }

  switchToNormalMode(): void {
    // Only switch if music is currently playing
    if (this.isPlaying) {
      // Switch to a random non-bike song
      const nonBikeSongs = this.songs.filter(song => song.name !== 'Bike Mode (Fast 8-bit)');
      if (nonBikeSongs.length > 0) {
        const randomSong = nonBikeSongs[Math.floor(Math.random() * nonBikeSongs.length)];
        this.switchToSong(randomSong.name);
      }
    }
  }

  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  destroy(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
