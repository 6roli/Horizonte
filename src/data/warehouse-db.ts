/**
 * The weather warehouse's gold tables in an in-memory DuckDB (DuckDB-WASM),
 * for the "Ask the warehouse" module (/ask/).
 *
 * DuckDB's .wasm files (35–40 MB) are above Cloudflare's 25 MiB static file
 * limit, so they come from jsDelivr at the version pinned in package.json.
 *
 * The Parquet files are fetched here, not by DuckDB: Hugging Face answers 404
 * to requests with a Referer from a *.workers.dev page, and fetch() with
 * referrerPolicy 'no-referrer' is the known-good path (see load-snapshot.ts).
 */
import * as duckdb from '@duckdb/duckdb-wasm';
import { TABLES, type TableName } from './text2sql-prompt.ts';
import { PARTITIONED_TABLES, tableUrls } from './text2sql.ts';

const REQUEST_TIMEOUT_MS = 30_000;
/** Rows kept from a query result; the page shows at most this many. */
export const MAX_ROWS = 200;

export interface QueryResult {
  columns: string[];
  /** Arrow type of each column, e.g. "Float64", "Timestamp<MICROSECOND>". */
  types: string[];
  rows: unknown[][];
  /** Total rows returned by the query (rows holds at most MAX_ROWS). */
  rowCount: number;
}

export interface Warehouse {
  /** Newest forecast issue time (max issued_at of latest_forecast), ISO string in UTC. */
  forecastIssuedAt: string | null;
  /** Partition days that could not be downloaded (usually the newest one, not written yet). */
  missingDays: number;
  query(sql: string): Promise<QueryResult>;
}

async function download(url: string): Promise<Uint8Array | null> {
  let response: Response;
  try {
    response = await fetch(url, {
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('the weather warehouse could not be reached');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`the weather warehouse answered ${response.status} ${response.statusText}`.trim());
  return new Uint8Array(await response.arrayBuffer());
}

async function startDuckDB(): Promise<duckdb.AsyncDuckDB> {
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  // A cross-origin worker script is not allowed, so a same-origin blob worker imports it.
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts(${JSON.stringify(bundle.mainWorker)});`], { type: 'text/javascript' }),
  );
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(workerUrl));
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  return db;
}

/** Downloads the gold tables and creates one DuckDB table per name in the model's prompt. */
export async function openWarehouse(today: string): Promise<Warehouse> {
  const [db, files] = await Promise.all([
    startDuckDB(),
    Promise.all(
      TABLES.map(async (table) => {
        const urls = tableUrls(table, today);
        const buffers = await Promise.all(urls.map(download));
        return { table, buffers };
      }),
    ),
  ]);

  const connection = await db.connect();
  let missingDays = 0;
  for (const { table, buffers } of files) {
    const names: string[] = [];
    buffers.forEach((buffer, index) => {
      if (!buffer) return;
      const name = `${table}_${index}.parquet`;
      db.registerFileBuffer(name, buffer);
      names.push(name);
    });
    if (PARTITIONED_TABLES.includes(table)) missingDays = Math.max(missingDays, buffers.length - names.length);
    if (names.length === 0) throw new Error(`the table ${table} is not available in the weather warehouse`);
    const list = names.map((name) => `'${name}'`).join(', ');
    // daily_summary and forecast_vs_observed have a `date` column too: union_by_name keeps a single one
    await connection.query(`CREATE TABLE ${table satisfies TableName} AS SELECT * FROM read_parquet([${list}], union_by_name = true)`);
  }

  const issued = await connection.query('SELECT strftime(max(issued_at), \'%Y-%m-%dT%H:%M:%SZ\') AS t FROM latest_forecast');
  const forecastIssuedAt = (issued.toArray()[0]?.toJSON().t as string | null) ?? null;

  return {
    forecastIssuedAt,
    missingDays,
    async query(sql: string): Promise<QueryResult> {
      const table = await connection.query(sql);
      const fields = table.schema.fields;
      const rows: unknown[][] = [];
      for (const row of table) {
        if (rows.length >= MAX_ROWS) break;
        const values = row.toArray() as unknown[];
        rows.push(values);
      }
      return {
        columns: fields.map((field) => field.name),
        types: fields.map((field) => String(field.type)),
        rows,
        rowCount: table.numRows,
      };
    },
  };
}
