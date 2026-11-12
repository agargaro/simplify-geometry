import type { WebGLRenderer } from 'three';

interface TimerQueryExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface DebugRendererInfo {
  UNMASKED_RENDERER_WEBGL: number;
}

export interface RendererInfo {
  label: string;
  detail: string;
}

const averageFrames = 30;
const reportFrames = 10;

/**
 * Measures the GPU time of the frames drawn between `begin` and `end` with `EXT_disjoint_timer_query_webgl2`. The results arrive a few
 * frames later; `time` is the average of the last frames in milliseconds, or -1 when no frame was measured yet. `onTime` reports the
 * first measured frame and then every `reportFrames` frames.
 */
export class GpuTimer {
  readonly isSupported: boolean;
  time = -1;
  onTime: ((milliseconds: number) => void) | null = null;
  private readonly gl: WebGL2RenderingContext;
  private readonly extension: TimerQueryExtension | null;
  private readonly samples = new Float64Array(averageFrames);
  private readonly pending: WebGLQuery[] = [];
  private readonly free: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  private sampleCount = 0;
  private sampleIndex = 0;
  private sampleSum = 0;
  private sinceReport = 0;
  private reported = false;

  constructor(renderer: WebGLRenderer) {
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.extension = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExtension | null;
    this.isSupported = this.extension !== null;
  }

  begin(): void {
    if (this.extension === null || this.active !== null) return;

    const query = this.free.pop() ?? this.gl.createQuery();

    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = query;
  }

  end(): void {
    if (this.extension === null || this.active === null) return;

    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Reads the finished queries; call it once per animation frame, also when nothing is drawn. */
  poll(): void {
    if (this.extension === null || this.pending.length === 0) return;

    const gl = this.gl;
    const isDisjoint = gl.getParameter(this.extension.GPU_DISJOINT_EXT) as boolean;
    while (this.pending.length > 0) {
      const query = this.pending[0];

      if (!(gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE) as boolean)) break;

      this.pending.shift();
      this.free.push(query);

      if (isDisjoint) continue;

      this.addSample((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6);

      if (++this.sinceReport < reportFrames && this.reported) continue;

      this.sinceReport = 0;
      this.reported = true;
      this.onTime?.(this.time);
    }
  }

  private addSample(milliseconds: number): void {
    if (this.sampleCount === averageFrames) this.sampleSum -= this.samples[this.sampleIndex];
    else this.sampleCount++;

    this.samples[this.sampleIndex] = milliseconds;
    this.sampleSum += milliseconds;
    this.sampleIndex = (this.sampleIndex + 1) % averageFrames;
    this.time = this.sampleSum / this.sampleCount;
  }
}

/**
 * The graphics API and the GPU of `renderer`: the GPU name comes from `WEBGL_debug_renderer_info` when the browser exposes it, else from
 * the renderer string of the context. `detail` keeps the full string.
 */
export function getRendererInfo(renderer: WebGLRenderer): RendererInfo {
  const gl = renderer.getContext();
  const api = renderer.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL';
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as DebugRendererInfo | null;
  const full = String(gl.getParameter(debugInfo === null ? gl.RENDERER : debugInfo.UNMASKED_RENDERER_WEBGL) ?? '');
  const gpu = getGpuName(full);

  return { label: gpu === '' ? api : `${api} · ${gpu}`, detail: full === '' ? api : `${api} · ${full}` };
}

function getGpuName(renderer: string): string {
  const angle = /^ANGLE \((.*)\)$/.exec(renderer.trim());

  if (angle === null) return renderer.trim();

  const parts = angle[1].split(', ');
  const device = parts.length > 1 ? parts[1] : parts[0];

  return device.replace(/\s*\(0x[0-9a-f]+\)/gi, '').replace(/\s+(Direct3D|OpenGL|Vulkan|Metal).*$/i, '').trim();
}
