import { Scene } from 'phaser';

// Music manager for playing MP3 files using Phaser's audio system
export class MP3Music {
  private scene: Scene;
  private music?: Phaser.Sound.BaseSound;
  private isPlaying = false;
  private volume = 0.5; // 50% volume by default

  constructor(scene: Scene) {
    this.scene = scene;
  }

  // Load the music file (should be called in preload)
  load(): void {
    if (!this.scene.sound.get('mo-bamba')) {
      this.scene.load.audio('mo-bamba', '/mo-bamba.mp3');
    }
  }

  // Play the music (assumes already loaded via preload)
  play(): void {
    // Check cache first to see if audio is loaded
    if (!this.scene.cache.audio.exists('mo-bamba')) {
      // Audio not in cache, wait for it to load
      console.warn('Mo Bamba music not in cache, waiting for load to complete...');
      
      // Check if loader is still loading
      if (this.scene.load.isLoading()) {
        this.scene.load.once('filecomplete-audio-mo-bamba', () => {
          this.music = this.scene.sound.add('mo-bamba', { loop: true, volume: this.volume });
          this.play(); // Recursively call play now that it's loaded
        });
      } else {
        // Loader finished but file not in cache, try to load it now
        this.scene.load.audio('mo-bamba', '/mo-bamba.mp3');
        this.scene.load.once('filecomplete-audio-mo-bamba', () => {
          this.music = this.scene.sound.add('mo-bamba', { loop: true, volume: this.volume });
          this.play(); // Recursively call play now that it's loaded
        });
        this.scene.load.start();
      }
      return;
    }

    // Audio is in cache, get or create the sound
    if (!this.music) {
      // Use sound.add instead of sound.get to create a new sound instance
      this.music = this.scene.sound.add('mo-bamba', { loop: true, volume: this.volume });
    }

    if (this.music) {
      // Check if it's already playing
      if (this.music.isPlaying) {
        this.isPlaying = true;
        return;
      }
      
      // Resume audio context if suspended (browser autoplay policy)
      const tryPlay = () => {
        try {
          if (!this.music) return;
          
          // Make sure the sound is configured correctly
          this.music.setLoop(true);
          this.music.setVolume(this.volume);
          
          this.music.play();
          this.isPlaying = true;
          console.log('Mo Bamba music started playing');
        } catch (error) {
          console.warn('Failed to play music:', error);
          this.isPlaying = false;
        }
      };
      
      if (this.scene.sound.context && this.scene.sound.context.state === 'suspended') {
        this.scene.sound.context.resume().then(() => {
          tryPlay();
        }).catch((err) => {
          console.warn('Failed to resume audio context:', err);
          // Try to play anyway
          tryPlay();
        });
      } else {
        // Play directly
        tryPlay();
      }
    }
  }

  // Stop the music
  stop(): void {
    if (this.music && this.isPlaying) {
      this.music.stop();
      this.isPlaying = false;
    }
  }

  // Pause the music
  pause(): void {
    if (this.music && this.isPlaying) {
      this.music.pause();
      this.isPlaying = false;
    }
  }

  // Resume the music
  resume(): void {
    if (this.music && !this.isPlaying) {
      this.music.resume();
      this.isPlaying = true;
    }
  }

  // Set volume (0.0 to 1.0)
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.music) {
      this.music.setVolume(this.volume);
    }
  }

  // Get current volume
  getVolume(): number {
    return this.volume;
  }

  // Check if music is playing
  isMusicPlaying(): boolean {
    return this.isPlaying && this.music !== undefined && this.music.isPlaying;
  }

  // Toggle play/pause
  toggle(): void {
    if (this.isMusicPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  // Destroy and cleanup
  destroy(): void {
    if (this.music) {
      this.music.stop();
      this.music.destroy();
      this.music = undefined;
    }
    this.isPlaying = false;
  }
}
