const sampleFrames = 10;
const idleFrames = 30;

/**
 * Measures the frames per second of consecutive drawn frames and reports them every `sampleFrames` frames. Reports -1 once the viewport
 * stops drawing for `idleFrames` animation frames, because it draws only when something changes.
 */
export class FrameRate {
  onRate: ((fps: number) => void) | null = null;
  private previous = -1;
  private frames = 0;
  private elapsed = 0;
  private skipped = 0;

  tick(time: number, rendered: boolean): void {
    if (!rendered) {
      this.previous = -1;
      this.frames = 0;
      this.elapsed = 0;

      if (++this.skipped === idleFrames) this.onRate?.(-1);

      return;
    }

    this.skipped = 0;

    if (this.previous >= 0) {
      this.elapsed += time - this.previous;
      this.frames++;
    }

    this.previous = time;

    if (this.frames < sampleFrames) return;

    this.onRate?.((1000 * this.frames) / this.elapsed);
    this.frames = 0;
    this.elapsed = 0;
  }
}
