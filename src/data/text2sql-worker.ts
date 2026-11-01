/**
 * Web Worker that runs the fine-tuned text-to-SQL model with transformers.js
 * on WebGPU, so the page stays responsive while it downloads and generates.
 *
 * The model (onnx/model_q4f16.onnx, 1.34 GB) is cached by the browser after the
 * first download. ONNX Runtime's .wasm files come from jsDelivr (above
 * Cloudflare's 25 MiB static file limit).
 */
import { AutoModelForCausalLM, AutoTokenizer, env, type PreTrainedTokenizer, type Tensor } from '@huggingface/transformers';
import { chatText } from './text2sql-prompt.ts';
import { MODEL_REPO, type WorkerRequest, type WorkerResponse } from './text2sql-model.ts';

const MAX_NEW_TOKENS = 200;

// Import ONNX Runtime's loader straight from jsDelivr instead of re-serving it from a
// blob: URL, which the CSP does not allow for scripts. The browser's HTTP cache keeps it.
env.useWasmCache = false;

let tokenizer: PreTrainedTokenizer | null = null;
let model: Awaited<ReturnType<typeof AutoModelForCausalLM.from_pretrained>> | null = null;
let stopIds: number[] = [];

const post = (message: WorkerResponse) => self.postMessage(message);

async function load(): Promise<void> {
  // Bytes per file, to report one overall progress for the tokenizer, config and model files.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (event: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (event.status !== 'progress' || !event.file || !event.total) return;
    files.set(event.file, { loaded: event.loaded ?? 0, total: event.total });
    let loaded = 0;
    let total = 0;
    for (const file of files.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    post({ type: 'progress', loaded, total });
  };

  tokenizer = await AutoTokenizer.from_pretrained(MODEL_REPO, { progress_callback });
  stopIds = ['<|im_end|>', '<|endoftext|>'].map((token) => tokenizer!.encode(token, { add_special_tokens: false })[0]!);
  model = await AutoModelForCausalLM.from_pretrained(MODEL_REPO, { dtype: 'q4f16', device: 'webgpu', progress_callback });
  post({ type: 'ready' });
}

async function generate(id: number, question: string, today: string): Promise<void> {
  if (!tokenizer || !model) throw new Error('the model is not loaded');
  const start = performance.now();
  // The chat text is built by hand, exactly as in training (see text2sql-prompt.ts).
  const inputs = tokenizer(chatText(question, today), { add_special_tokens: false });
  const output = (await model.generate({
    ...inputs,
    max_new_tokens: MAX_NEW_TOKENS,
    do_sample: false,
    eos_token_id: stopIds,
  })) as Tensor;
  const promptLength = (inputs.input_ids as Tensor).dims[1]!;
  const tokens = (output.tolist() as bigint[][])[0]!.slice(promptLength);
  const text = tokenizer.decode(tokens, { skip_special_tokens: true });
  post({ type: 'result', id, text, seconds: (performance.now() - start) / 1000 });
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const task = request.type === 'load' ? load() : generate(request.id, request.question, request.today);
  task.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: 'error', id: request.type === 'generate' ? request.id : undefined, message });
  });
});
