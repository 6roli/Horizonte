import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import examples from '../src/config/text2sql-examples.json';
import { checkQuery, cleanPrediction, moveDate, recentDates, tableUrls, utcDate } from '../src/data/text2sql.ts';
import { chatMessages, chatText, LOCATION_IDS } from '../src/data/text2sql-prompt.ts';
import { formatCell, isNumericType } from '../src/ui/ask-format.ts';

/** Generated from the Python code of weather-text2sql (text2sql/schema.py). */
const fixture = JSON.parse(readFileSync(new URL('./fixtures/text2sql-prompt.json', import.meta.url), 'utf8'));

describe('prompt', () => {
  it('matches the training prompt byte for byte', () => {
    expect(chatMessages(fixture.question, fixture.today)).toEqual(fixture.messages);
    expect(chatText(fixture.question, fixture.today)).toBe(fixture.chat_text);
  });

  it('lists the capitals in the training order', () => {
    expect(LOCATION_IDS).toEqual(fixture.location_ids);
  });
});

describe('cleanPrediction', () => {
  it('keeps a bare query', () => {
    expect(cleanPrediction('  SELECT 1  ')).toBe('SELECT 1');
  });

  it('takes the content of a ```sql fence', () => {
    expect(cleanPrediction('```sql\nSELECT 1;\n```\nThis returns one.')).toBe('SELECT 1');
  });

  it('cuts at the first semicolon', () => {
    expect(cleanPrediction('SELECT 1; DROP TABLE x')).toBe('SELECT 1');
  });
});

describe('checkQuery', () => {
  it('accepts SELECT and WITH in any case', () => {
    expect(checkQuery('select 1')).toBeNull();
    expect(checkQuery('WITH a AS (SELECT 1) SELECT * FROM a')).toBeNull();
  });

  it('rejects empty answers and other statements', () => {
    expect(checkQuery('  ')).toBe('empty');
    expect(checkQuery('DELETE FROM latest_forecast')).toBe('not-select');
    expect(checkQuery('selection')).toBe('not-select');
  });
});

describe('moveDate', () => {
  it('replaces every DATE literal of the example day', () => {
    const sql = "SELECT 1 WHERE d = DATE '2026-10-25' - INTERVAL 1 DAY OR d = DATE '2026-10-25'";
    expect(moveDate(sql, '2026-10-25', '2026-11-01')).toBe(
      "SELECT 1 WHERE d = DATE '2026-11-01' - INTERVAL 1 DAY OR d = DATE '2026-11-01'",
    );
  });

  it('leaves other dates and bare strings alone', () => {
    const sql = "SELECT '2026-10-25', DATE '2026-10-24'";
    expect(moveDate(sql, '2026-10-25', '2026-11-01')).toBe(sql);
  });

  it('moves the date of every saved example', () => {
    for (const example of examples.examples) {
      const moved = moveDate(example.sql, example.today, '2030-01-01');
      expect(moved).not.toContain(example.today);
    }
  });
});

describe('table URLs', () => {
  it('uses UTC dates', () => {
    expect(utcDate(new Date('2026-11-01T23:30:00+01:00'))).toBe('2026-11-01');
    expect(utcDate(new Date('2026-11-01T00:30:00+01:00'))).toBe('2026-10-31');
  });

  it('lists recent days across a month boundary, oldest first', () => {
    expect(recentDates('2026-11-02', 4)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('builds one file for plain tables and one per day for partitioned ones', () => {
    expect(tableUrls('latest_forecast', '2026-11-01')).toEqual([
      'https://huggingface.co/buckets/groli/weather-warehouse/resolve/gold/latest_forecast/data.parquet',
    ]);
    const daily = tableUrls('daily_summary', '2026-11-01', 2);
    expect(daily).toEqual([
      'https://huggingface.co/buckets/groli/weather-warehouse/resolve/gold/daily_summary/date=2026-10-31/data.parquet',
      'https://huggingface.co/buckets/groli/weather-warehouse/resolve/gold/daily_summary/date=2026-11-01/data.parquet',
    ]);
  });
});

describe('result formatting', () => {
  it('formats Arrow values for the table', () => {
    const noon = Date.UTC(2026, 10, 1, 12, 0);
    expect(formatCell(null, 'Float64')).toBe('—');
    expect(formatCell(12.3456, 'Float64')).toBe('12.35');
    expect(formatCell(7n, 'Int64')).toBe('7');
    expect(formatCell(noon, 'Timestamp<MICROSECOND>')).toBe('2026-11-01 12:00');
    expect(formatCell(Date.UTC(2026, 10, 1), 'Date32<DAY>')).toBe('2026-11-01');
    expect(formatCell('Bilbao', 'Utf8')).toBe('Bilbao');
  });

  it('right-aligns numbers only', () => {
    expect(isNumericType('Float64')).toBe(true);
    expect(isNumericType('Int64')).toBe(true);
    expect(isNumericType('Utf8')).toBe(false);
  });
});
