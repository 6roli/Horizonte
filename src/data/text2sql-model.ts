/**
 * Page side of the text-to-SQL model: checks WebGPU support and talks to the
 * Web Worker in text2sql-worker.ts, which downloads and runs the model.
 */

/** Public Hugging Face repository of the fine-tuned model (weather-text2sql). */
export const MODEL_REPO = 'groli/weather-text2sql-qwen2.5-coder-1.5b';
export const MODEL_URL = `https://huggingface.co/${MODEL_REPO}`;
/** Size of onnx/model_q4f16.onnx, shown before the user starts the download. */
export const MODEL_DOWNLOAD_GB = 1.34;

export type WorkerRequest = { type: 'load' } | { type: 'generate'; id: number; question: string; today: string };

export type WorkerResponse =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; text: string; seconds: number }
  | { type: 'error'; id?: number; message: string };

/** Why the live model cannot run here, or null when it can. */
export type GpuProblem = 'no-webgpu' | 'no-adapter' | 'no-f16' | null;

interface GpuLike {
  requestAdapter(): Promise<{ features: { has(name: string): boolean } } | null>;
}

/** The model's weights are 4-bit with float16 activations: WebGPU needs the shader-f16 feature. */
export async function checkWebGpu(): Promise<GpuProblem> {
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  if (!gpu) return 'no-webgpu';
  let adapter;
  try {
    adapter = await gpu.requestAdapter();
  } catch {
    return 'no-adapter';
  }
  if (!adapter) return 'no-adapter';
  return adapter.features.has('shader-f16') ? null : 'no-f16';
}

export interface ModelEvents {
  onProgress(loaded: number, total: number): void;
}

/** One worker per page; questions are answered one at a time, in order. */
export class Text2SqlModel {
  private readonly worker: Worker;
  private nextId = 1;
  private readonly pending = new Map<number, { resolve(v: { text: string; seconds: number }): void; reject(e: Error): void }>();
  private loading: Promise<void> | null = null;
  private readonly events: ModelEvents;

  constructor(events: ModelEvents) {
    this.events = events;
    this.worker = new Worker(new URL('./text2sql-worker.ts', import.meta.url), { type: 'module' });
  }

  load(): Promise<void> {
    this.loading ??= new Promise<void>((resolve, reject) => {
      this.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === 'progress') this.events.onProgress(message.loaded, message.total);
        else if (message.type === 'ready') resolve();
        else if (message.type === 'result') {
          this.pending.get(message.id)?.resolve({ text: message.text, seconds: message.seconds });
          this.pending.delete(message.id);
        } else if (message.type === 'error') {
          if (message.id === undefined) reject(new Error(message.message));
          else {
            this.pending.get(message.id)?.reject(new Error(message.message));
            this.pending.delete(message.id);
          }
        }
      });
      this.worker.postMessage({ type: 'load' } satisfies WorkerRequest);
    });
    return this.loading;
  }

  async ask(question: string, today: string): Promise<{ text: string; seconds: number }> {
    await this.load();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ type: 'generate', id, question, today } satisfies WorkerRequest);
    });
  }
}
