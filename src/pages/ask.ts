/**
 * "Ask the warehouse" page (/ask/): a fine-tuned text-to-SQL model running in
 * the browser (WebGPU) writes DuckDB SQL for a question, and DuckDB-WASM runs
 * it on the weather warehouse's gold tables. Saved examples work without the
 * model; the model is only downloaded when the visitor asks for it.
 */
import '@fontsource-variable/inter';
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/ask.css';
import examplesFile from '../config/text2sql-examples.json';
import mistakesFile from '../config/text2sql-mistakes.json';
import { LOCAL_TIME_ZONE } from '../config/app.ts';
import { checkQuery, cleanPrediction, moveDate, utcDate } from '../data/text2sql.ts';
import { checkWebGpu, MODEL_DOWNLOAD_GB, Text2SqlModel, type GpuProblem } from '../data/text2sql-model.ts';
import { openWarehouse, type QueryResult, type Warehouse } from '../data/warehouse-db.ts';
import { t } from '../i18n/index.ts';
import { formatCell, formatDownload, isNumericType } from '../ui/ask-format.ts';
import { formatInZone } from '../ui/time-format.ts';
import { mountTopBar } from '../ui/topbar.ts';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id} in ask/index.html`);
  return element as T;
}

const elements = {
  status: byId<HTMLDivElement>('status'),
  dataStatus: byId<HTMLParagraphElement>('data-status'),
  gpuStatus: byId<HTMLParagraphElement>('gpu-status'),
  loadModel: byId<HTMLButtonElement>('load-model'),
  progress: byId<HTMLDivElement>('model-progress'),
  progressBar: byId<HTMLDivElement>('model-progress-bar'),
  form: byId<HTMLFormElement>('ask-form'),
  question: byId<HTMLInputElement>('question'),
  askButton: byId<HTMLButtonElement>('ask-button'),
  answer: byId<HTMLElement>('answer'),
  examples: byId<HTMLUListElement>('examples'),
  mistakes: byId<HTMLDivElement>('mistakes'),
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const today = utcDate(new Date());
let warehouse: Promise<Warehouse> | null = null;

/* Data ----------------------------------------------------------------------------- */

function renderStatus(kind: 'loading' | 'error' | 'none', title = '', body = ''): void {
  const { status } = elements;
  status.className = `status status--${kind}`;
  status.replaceChildren();
  if (kind === 'none') return;
  status.append(el('strong', undefined, title));
  if (body) status.append(` ${body}`);
  if (kind === 'error') {
    const retry = el('button', 'button', t('errorRetry'));
    retry.type = 'button';
    retry.addEventListener('click', () => void loadData());
    status.append(' ', retry);
  }
}

async function loadData(): Promise<void> {
  renderStatus('loading', t('askDataLoading'));
  warehouse = openWarehouse(today);
  try {
    const db = await warehouse;
    renderStatus('none');
    const issued = db.forecastIssuedAt ? formatInZone(new Date(db.forecastIssuedAt), LOCAL_TIME_ZONE) : '—';
    const missing = db.missingDays > 1 ? ` ${t('askDataMissingDays', { count: db.missingDays })}` : '';
    elements.dataStatus.textContent = t('askDataReady', { issued }) + missing;
  } catch (error) {
    warehouse = null;
    const reason = error instanceof Error ? error.message : String(error);
    renderStatus('error', t('askDataErrorTitle'), t('askDataErrorBody', { reason }));
  }
}

/* Results ---------------------------------------------------------------------------- */

function resultTable(result: QueryResult): HTMLElement {
  const wrap = el('div', 'table-scroll result');
  wrap.tabIndex = 0;
  const table = el('table', 'result__table');
  const head = el('tr');
  result.columns.forEach((name, i) => {
    const th = el('th', isNumericType(result.types[i]!) ? 'num' : undefined, name);
    th.scope = 'col';
    head.append(th);
  });
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const row of result.rows) {
    const tr = el('tr');
    row.forEach((value, i) => tr.append(el('td', isNumericType(result.types[i]!) ? 'num' : undefined, formatCell(value, result.types[i]!))));
    body.append(tr);
  }
  table.append(thead, body);
  wrap.append(table);
  return wrap;
}

/** Runs one query and returns the block that shows its outcome: a table, "no rows" or the error. */
async function runQuery(sql: string): Promise<HTMLElement> {
  const problem = checkQuery(sql);
  if (problem) return el('p', 'answer__error', t(problem === 'empty' ? 'askEmptyAnswer' : 'askNotSelect'));
  if (!warehouse) await loadData();
  let result: QueryResult;
  try {
    result = await warehouse!.then((db) => db.query(sql));
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    return el('p', 'answer__error', t('askInvalidSql', { reason: reason ?? '' }));
  }
  if (result.rowCount === 0) return el('p', 'muted', t('askNoRows'));
  const block = el('div');
  const count =
    result.rowCount > result.rows.length
      ? t('askRowsCapped', { count: result.rowCount, shown: result.rows.length })
      : t('askRows', { count: result.rowCount });
  block.append(resultTable(result), el('p', 'muted result__count', count));
  return block;
}

function sqlBlock(sql: string): HTMLElement {
  const wrap = el('div', 'sql');
  const pre = el('pre', 'sql__code');
  pre.append(el('code', undefined, sql || '—'));
  const copy = el('button', 'button button--ghost sql__copy', t('askCopy'));
  copy.type = 'button';
  copy.addEventListener('click', () => {
    void navigator.clipboard?.writeText(sql).then(() => {
      copy.textContent = t('askCopied');
      setTimeout(() => (copy.textContent = t('askCopy')), 1500);
    });
  });
  wrap.append(pre, copy);
  return wrap;
}

async function showAnswer(question: string, sql: string, source: string): Promise<void> {
  const { answer } = elements;
  answer.hidden = false;
  answer.replaceChildren(el('h2', 'answer__question', question), el('p', 'muted answer__source', source), sqlBlock(sql));
  answer.append(await runQuery(sql));
}

/* Examples and mistakes -------------------------------------------------------------- */

function renderExamples(): void {
  elements.examples.replaceChildren(
    ...examplesFile.examples.map((example) => {
      const item = el('li');
      const button = el('button', 'chip', example.question);
      button.type = 'button';
      button.addEventListener('click', () => {
        const sql = moveDate(example.sql, example.today, today);
        void showAnswer(example.question, sql, t('askSourceExample')).then(() =>
          elements.answer.scrollIntoView({ block: 'start' }),
        );
      });
      item.append(button);
      return item;
    }),
  );
}

function renderMistakes(): void {
  elements.mistakes.replaceChildren(
    ...mistakesFile.mistakes.map((mistake) => {
      const details = el('details', 'mistake panel');
      const summary = el('summary');
      summary.append(el('span', 'mistake__question', mistake.question), el('span', 'mistake__note', mistake.note));
      const body = el('div', 'mistake__body');
      const modelSql = moveDate(mistake.model, '2026-10-25', today);
      const referenceSql = moveDate(mistake.reference, '2026-10-25', today);
      const modelCol = el('div', 'mistake__col');
      modelCol.append(el('h3', undefined, 'Browser model'), sqlBlock(modelSql));
      const referenceCol = el('div', 'mistake__col');
      referenceCol.append(el('h3', undefined, 'Reference'), sqlBlock(referenceSql));
      const columns = el('div', 'mistake__cols');
      columns.append(modelCol, referenceCol);
      const run = el('button', 'button button--ghost', t('askRunBoth'));
      run.type = 'button';
      run.addEventListener('click', async () => {
        run.disabled = true;
        const [modelResult, referenceResult] = await Promise.all([runQuery(modelSql), runQuery(referenceSql)]);
        modelCol.append(modelResult);
        referenceCol.append(referenceResult);
        run.remove();
      });
      body.append(
        el('p', 'muted', t(mistake.pytorchCorrect ? 'askPytorchRight' : 'askPytorchAlsoWrong')),
        columns,
        run,
      );
      details.append(summary, body);
      return details;
    }),
  );
}

/* Live model -------------------------------------------------------------------------- */

const GPU_MESSAGES: Record<Exclude<GpuProblem, null>, Parameters<typeof t>[0]> = {
  'no-webgpu': 'askGpuNoWebgpu',
  'no-adapter': 'askGpuNoAdapter',
  'no-f16': 'askGpuNoF16',
};

let model: Text2SqlModel | null = null;

async function setUpModel(): Promise<void> {
  elements.gpuStatus.textContent = t('askGpuChecking');
  const problem = await checkWebGpu();
  if (problem) {
    elements.gpuStatus.textContent = t(GPU_MESSAGES[problem]);
    return;
  }
  elements.gpuStatus.textContent = t('askGpuReady', { size: MODEL_DOWNLOAD_GB });
  elements.loadModel.textContent = t('askLoadButton', { size: MODEL_DOWNLOAD_GB });
  elements.loadModel.hidden = false;
  elements.loadModel.addEventListener('click', () => void loadModel());
}

async function loadModel(): Promise<void> {
  elements.loadModel.hidden = true;
  elements.progress.hidden = false;
  elements.gpuStatus.textContent = t('askLoadingModel', { progress: '' });
  model = new Text2SqlModel({
    onProgress(loaded, total) {
      const share = total > 0 ? loaded / total : 0;
      elements.progressBar.style.width = `${(share * 100).toFixed(1)}%`;
      elements.gpuStatus.textContent =
        share >= 0.999 ? t('askPreparingModel') : t('askLoadingModel', { progress: formatDownload(loaded, total) });
    },
  });
  try {
    await model.load();
  } catch (error) {
    model = null;
    elements.progress.hidden = true;
    elements.loadModel.hidden = false;
    const reason = error instanceof Error ? error.message : String(error);
    elements.gpuStatus.textContent = t('askModelError', { reason });
    return;
  }
  elements.progress.hidden = true;
  elements.gpuStatus.textContent = t('askModelReady');
  elements.form.hidden = false;
  elements.question.focus();
}

async function ask(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const question = elements.question.value.trim();
  if (!question) {
    elements.gpuStatus.textContent = t('askQuestionEmpty');
    return;
  }
  if (!model) return;
  elements.askButton.disabled = true;
  elements.gpuStatus.textContent = t('askThinking');
  try {
    const { text, seconds } = await model.ask(question, today);
    elements.gpuStatus.textContent = t('askModelReady');
    await showAnswer(question, cleanPrediction(text), t('askSourceModel', { seconds: seconds.toFixed(1) }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    elements.gpuStatus.textContent = t('askModelError', { reason });
  } finally {
    elements.askButton.disabled = false;
  }
}

mountTopBar('ask');
renderExamples();
renderMistakes();
elements.form.addEventListener('submit', (event) => void ask(event));
void loadData();
void setUpModel();
