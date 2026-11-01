/**
 * Helpers for the "Ask the warehouse" module (/ask/): cleaning the model's
 * answer, checking it is one read-only query, moving the date of the saved
 * examples to today and building the URLs of the warehouse's gold tables.
 *
 * No DOM code here: tests import this file in Node.
 */
import type { TableName } from './text2sql-prompt.ts';

/** Public bucket of the weather warehouse (https://github.com/6roli/weather-warehouse). */
export const GOLD_BASE_URL = 'https://huggingface.co/buckets/groli/weather-warehouse/resolve/gold';

/** Tables written as one Parquet file per day (date=YYYY-MM-DD/data.parquet). */
export const PARTITIONED_TABLES: readonly TableName[] = ['daily_summary', 'forecast_vs_observed'];

/** Days of the partitioned tables loaded in the browser, ending today. */
export const PARTITION_DAYS = 10;

/**
 * Same as clean_prediction in weather-text2sql (text2sql/evaluate.py): models
 * sometimes wrap the query in ```sql fences or add text after it.
 */
export function cleanPrediction(text: string): string {
  let sql = text.trim();
  if (sql.includes('```')) {
    const parts = sql.split('```');
    sql = parts.length > 1 ? parts[1]! : parts[0]!;
    if (sql.toLowerCase().startsWith('sql')) sql = sql.slice(3);
  }
  return sql.trim().split(';')[0]!.trim();
}

/** Why a query is not run, or null when it can be run. */
export type QueryProblem = 'empty' | 'not-select' | null;

/** Only one SELECT (or WITH … SELECT) statement is run; cleanPrediction already cut at the first `;`. */
export function checkQuery(sql: string): QueryProblem {
  if (!sql.trim()) return 'empty';
  return /^(select|with)\b/i.test(sql.trim()) ? null : 'not-select';
}

/** YYYY-MM-DD of a moment in UTC (the model's prompt says "Today (UTC)"). */
export function utcDate(moment: Date): string {
  return moment.toISOString().slice(0, 10);
}

/**
 * The saved examples were written with "Today (UTC): <from>", so their SQL
 * contains DATE '<from>'. Moves exactly that literal to another day.
 */
export function moveDate(sql: string, from: string, to: string): string {
  return sql.split(`DATE '${from}'`).join(`DATE '${to}'`);
}

/** The last `days` UTC dates up to `today` (YYYY-MM-DD), oldest first. */
export function recentDates(today: string, days: number = PARTITION_DAYS): string[] {
  const end = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => utcDate(new Date(end - (days - 1 - i) * 86_400_000)));
}

/** URLs to download for one gold table: a single file, or one per recent day. */
export function tableUrls(table: TableName, today: string, days: number = PARTITION_DAYS): string[] {
  if (!PARTITIONED_TABLES.includes(table)) return [`${GOLD_BASE_URL}/${table}/data.parquet`];
  return recentDates(today, days).map((date) => `${GOLD_BASE_URL}/${table}/date=${date}/data.parquet`);
}
