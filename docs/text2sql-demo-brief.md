# Brief: "Ask the warehouse" module (text-to-SQL in the browser)

Working brief for building the module on branch `feature/ask-the-warehouse`. Delete this file in the last commit
of the PR, once the README documents the module (step 9).

## Goal

A new Horizonte module at `/ask/` where anyone types a question about the weather in Spain's 52 provincial
capitals (Spanish or English), a fine-tuned LLM **running in their browser** turns it into DuckDB SQL, and
DuckDB-WASM runs that SQL over the **live** weather warehouse gold tables. No server, no API keys, €0.

It is a showcase of [6roli/weather-text2sql](https://github.com/6roli/weather-text2sql): QLoRA fine-tune of
Qwen2.5-Coder-1.5B-Instruct (Apache-2.0). Read its README first ("Results" and "Browser version" sections).

Numbers to show on the page (40 hand-written questions, execution accuracy on a frozen snapshot):
base model 7.5% → fine-tuned 87.5% (PyTorch) → **75% in the browser** (ONNX, 4-bit weights / fp16, 1.34 GB).
The browser model loses detail sometimes (a missing filter, a missing `DISTINCT`); say so honestly.

## Two modes

1. **Examples (default, instant, no download).** `src/config/text2sql-examples.json` holds 15 questions the
   browser model answered correctly, with its SQL verbatim. The prompt said `Today (UTC): 2026-10-25`, so the SQL
   contains `DATE '2026-10-25'`: replace that literal with today's UTC date before running it on live data (only
   that exact literal; unit-test the replacement). Label it clearly: "SQL written by the model in a test run; the
   date is moved to today".
2. **Live model (opt-in).** A button that states the download size (1.34 GB, cached by the browser after the first
   time) and the requirement (WebGPU with `shader-f16`; recent Chrome/Edge desktop). Only then download the model.
   Show download progress, then let the user type questions. Run the model in a **Web Worker** so the page stays
   responsive. If WebGPU / `shader-f16` is missing, say so and keep the examples mode working (a WASM/CPU fallback
   is acceptable only if it really works for a 1.5B model; otherwise don't offer it).

In both modes show: the question, the SQL (monospace, copyable), the result table (cap the display at 200 rows),
and errors in plain words (invalid SQL is a real outcome: show DuckDB's message).

## The model

- Hub repo (public): `groli/weather-text2sql-qwen2.5-coder-1.5b`. Files: `config.json`, `generation_config.json`,
  `tokenizer.json`, `tokenizer_config.json`, `chat_template.jinja`, `onnx/model_q4f16.onnx` (single file, no
  external data). Ignore `model.safetensors`, `lora_adapters/`, `results/`.
- Library: `@huggingface/transformers` (transformers.js v3, Apache-2.0), pinned exact version:
  `AutoTokenizer` + `AutoModelForCausalLM.from_pretrained(repo, { dtype: 'q4f16', device: 'webgpu' })`.
- **Prompt must be byte-identical to training.** Source of truth:
  [text2sql/schema.py](https://github.com/6roli/weather-text2sql/blob/main/text2sql/schema.py) (`SYSTEM`,
  `SCHEMA`, `CAPITALS` order, `user_prompt`). Port it to `src/data/text2sql-prompt.ts` and test it against
  `tests/fixtures/text2sql-prompt.json` (generated from the Python code: `messages` and the full `chat_text`).
- **Build the chat text yourself** exactly like `chat_text` in the fixture
  (`<|im_start|>system\n…<|im_end|>\n<|im_start|>user\n…<|im_end|>\n<|im_start|>assistant\n`) and tokenize it
  without adding special tokens. Don't rely on `apply_chat_template`: the model was saved with transformers 5, so
  the template lives in `chat_template.jinja` and `tokenizer_config.json` has `extra_special_tokens` as a list —
  transformers.js may not read either the way Python does.
- Generation: greedy (`do_sample: false`), `max_new_tokens: 200`, stop on `<|im_end|>` / `<|endoftext|>`.
  Post-process like `clean_prediction` in
  [text2sql/evaluate.py](https://github.com/6roli/weather-text2sql/blob/main/text2sql/evaluate.py): strip, take
  the content of a ``` fence if present (drop a leading `sql`), keep text before the first `;`. Unit-test it.
- `Today (UTC)` in the prompt = current UTC date `YYYY-MM-DD`.
- Sanity check to run once in a real browser and report in the PR: the model's SQL for the fixture question and
  for 3–4 example questions should match `text2sql-examples.json` (modulo the date).

## The data (DuckDB-WASM over the live bucket)

- Library: `@duckdb/duckdb-wasm` (MIT), pinned exact version.
- Bucket base: `https://huggingface.co/buckets/groli/weather-warehouse/resolve/gold/` (public; Hugging Face
  redirects to its CDN `*.hf.co`). Tables, as in
  [text2sql/snapshot.py](https://github.com/6roli/weather-text2sql/blob/main/text2sql/snapshot.py):
  - `latest_forecast/data.parquet`, `location_station/data.parquet` (single files)
  - `daily_summary/date=YYYY-MM-DD/data.parquet`, `forecast_vs_observed/date=YYYY-MM-DD/data.parquet`
    (one per day; no listing over HTTP, so build the URLs for the last ~10 days and skip missing days — the newest
    day may not exist yet). Read with `union_by_name = true`.
- Fetch the parquet files yourself with `fetch(url, { referrerPolicy: 'no-referrer', credentials: 'omit' })`,
  register the bytes in DuckDB (`registerFileBuffer`) and create one table per gold table **named exactly as in the
  prompt**. Don't let DuckDB do HTTP itself: **Hugging Face answers 404 to requests with a Referer from a
  `*.workers.dev` page** (see README "Gotcha"); `fetch` with `no-referrer` is the known-good path, as in
  `src/data/load-snapshot.ts`. The whole data set is a few MB.
- Load the data when the page opens (examples mode needs it); show its age (max `issued_at` of the forecast).
- Run only one statement that starts with `SELECT` or `WITH` (after `clean_prediction`); reject anything else
  with a message. It's a read-only in-memory DB in the user's own tab, so this is about clear errors, not security.

## Hosting constraints (Cloudflare Workers static assets, CSP)

- **25 MiB per static file limit** on Cloudflare: the DuckDB and ONNX Runtime `.wasm` files may exceed it. Either
  load them from `cdn.jsdelivr.net` at the pinned version (DuckDB's `getJsDelivrBundles`, transformers.js default
  ORT paths) or self-host only files under the limit. Check the real sizes and document the choice.
- Update the CSP in `public/_headers` for what is really needed, nothing more: likely `script-src 'self'
  'wasm-unsafe-eval'` (+ `https://cdn.jsdelivr.net` if used), `worker-src 'self' blob:`, `connect-src` +
  `https://cdn.jsdelivr.net` (Hugging Face hosts are already allowed; LFS/Xet redirects go to `*.hf.co`).
  Keep it working for the other pages; `tests/site.test.ts` checks site settings.
- Keep `Referrer-Policy: no-referrer`.

## Page and code

Follow "Add a module" in the README and the existing Weather module for structure and style:

- `ask/index.html`, `src/pages/ask.ts`, `src/styles/ask.css`, entry in `PAGES` (vite.config.ts) and in
  `HUB_MODULES` (`id: 'ask'`, `navLabel: 'Ask'`, title e.g. "Ask the weather warehouse", data source "Weather
  warehouse · fine-tuned Qwen2.5-Coder-1.5B in your browser", tags e.g. `['Forecasts', 'Observations', 'AI model']`).
- Strings in `src/i18n/en.ts` (UI in English; questions may be Spanish or English — say so).
- Logic without DOM in `src/data/` with Vitest tests: prompt (fixture), `clean_prediction`, date replacement,
  statement check, partition URL building. Formatting in `src/ui/`.
- Dark "liquid" design, sky theme, works at phone width, accessible (labels, `aria-live` status, keyboard).
  On phones say live mode needs a desktop GPU; examples mode must work everywhere.
- An "About" section: what the model is, the accuracy numbers above, that it runs entirely in the browser, that
  SQL can be wrong (it's a demo, not a source of truth), links to weather-text2sql and the model on Hugging Face,
  and the licences (Qwen2.5-Coder Apache-2.0; data attributions as on the Weather page: Open-Meteo CC BY 4.0,
  "Fuente: AEMET").
- Hub card preview `public/images/modules/ask.jpg` (1200×550): a real screenshot of the page in examples mode. If
  no browser is available to take it, say so in the PR description so Gabriel adds it before merging (the hub test
  requires the file).

## Done when

1. `npm run verify` passes (typecheck, tests, build).
2. Examples mode works in `npm run preview` with live data; live mode tested in a WebGPU browser if available
   (otherwise list exactly what is untested in the PR).
3. The other pages still work with the new CSP.
4. README updated: modules table, "How it works" section for `/ask/` (flow like the Weather one), technologies
   table (transformers.js, DuckDB-WASM, the model), CSP/CDN choices. Delete this brief.
5. Push the branch and open a PR to `main` (Cloudflare builds a preview at
   `https://feature-ask-the-warehouse-horizonte.gabriel-olius.workers.dev`).

Out of scope here (other repos, done later): the portfolio page for the module and its cover, the LinkedIn note.
