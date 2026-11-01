/**
 * The prompt of the fine-tuned text-to-SQL model, byte-identical to training.
 *
 * Port of text2sql/schema.py in https://github.com/6roli/weather-text2sql
 * (SYSTEM, SCHEMA, CAPITALS order, user_prompt). Any change there must be
 * copied here; tests/fixtures/text2sql-prompt.json is generated from the
 * Python code and checks both stay equal.
 *
 * No DOM code here: tests import this file in Node.
 */

export const SYSTEM =
  "You translate questions about the weather in Spain's provincial capitals into one DuckDB SQL query " +
  'over the tables below. Reply with the SQL query only.';

export const SCHEMA = `CREATE TABLE latest_forecast ( -- newest 72-hour forecast, one row per capital and hour
  location_id VARCHAR, location_name VARCHAR, province VARCHAR, latitude DOUBLE, longitude DOUBLE,
  issued_at TIMESTAMP, valid_at TIMESTAMP, lead_hours BIGINT, temperature_c DOUBLE,
  relative_humidity_pct DOUBLE, dew_point_c DOUBLE, precipitation_mm DOUBLE, pressure_msl_hpa DOUBLE,
  cloud_cover_pct DOUBLE, wind_speed_kmh DOUBLE, wind_direction_deg DOUBLE, wind_gusts_kmh DOUBLE,
  shortwave_radiation_wm2 DOUBLE);
CREATE TABLE location_station ( -- nearest AEMET weather station to each capital
  location_id VARCHAR, location_name VARCHAR, province VARCHAR, latitude DOUBLE, longitude DOUBLE,
  station_id VARCHAR, station_name VARCHAR, station_altitude_m DOUBLE, distance_km DOUBLE);
CREATE TABLE daily_summary ( -- observed weather per capital and day, and forecast error by lead time
  location_id VARCHAR, date DATE, observed_hours BIGINT, temperature_min_c DOUBLE, temperature_max_c DOUBLE,
  temperature_mean_c DOUBLE, precipitation_sum_mm DOUBLE, wind_speed_max_kmh DOUBLE,
  temperature_mae_lead_1_6h DOUBLE, temperature_mae_lead_7_24h DOUBLE, temperature_mae_lead_25_48h DOUBLE,
  temperature_mae_lead_49_72h DOUBLE);
CREATE TABLE forecast_vs_observed ( -- every forecast made for an observed hour; error = forecast - observed
  location_id VARCHAR, station_id VARCHAR, date DATE, valid_at TIMESTAMP, issued_at TIMESTAMP,
  lead_hours BIGINT, forecast_temperature_c DOUBLE, observed_temperature_c DOUBLE,
  error_temperature_c DOUBLE, forecast_relative_humidity_pct DOUBLE, observed_relative_humidity_pct DOUBLE,
  error_relative_humidity_pct DOUBLE, forecast_precipitation_mm DOUBLE, observed_precipitation_mm DOUBLE,
  forecast_pressure_msl_hpa DOUBLE, observed_pressure_msl_hpa DOUBLE, error_pressure_msl_hpa DOUBLE,
  forecast_wind_speed_kmh DOUBLE, observed_wind_speed_kmh DOUBLE, error_wind_speed_kmh DOUBLE);
-- All timestamps are UTC.`;

/** The gold tables the model writes SQL for, named as in SCHEMA. */
export const TABLES = ['latest_forecast', 'location_station', 'daily_summary', 'forecast_vs_observed'] as const;
export type TableName = (typeof TABLES)[number];

/** location_id of the 52 capitals, in the order of CAPITALS in schema.py. */
export const LOCATION_IDS = [
  'a-coruna', 'albacete', 'alicante', 'almeria', 'avila', 'badajoz', 'barcelona', 'bilbao', 'burgos', 'caceres',
  'cadiz', 'castellon-de-la-plana', 'ceuta', 'ciudad-real', 'cordoba', 'cuenca', 'girona', 'granada', 'guadalajara',
  'huelva', 'huesca', 'jaen', 'las-palmas-de-gran-canaria', 'leon', 'lleida', 'logrono', 'lugo', 'madrid', 'malaga',
  'melilla', 'murcia', 'ourense', 'oviedo', 'palencia', 'palma', 'pamplona', 'pontevedra', 'salamanca',
  'san-sebastian', 'santa-cruz-de-tenerife', 'santander', 'segovia', 'sevilla', 'soria', 'tarragona', 'teruel',
  'toledo', 'valencia', 'valladolid', 'vitoria-gasteiz', 'zamora', 'zaragoza',
] as const;

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export function userPrompt(question: string, today: string): string {
  return `${SCHEMA}\n-- location_id values: ${LOCATION_IDS.join(', ')}\n\nToday (UTC): ${today}\nQuestion: ${question}`;
}

export function chatMessages(question: string, today: string): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userPrompt(question, today) },
  ];
}

/**
 * The Qwen chat text the model was trained on, ending where the assistant's
 * answer starts. Built by hand instead of with apply_chat_template: the model
 * was saved with transformers 5, whose template files transformers.js may read
 * differently. Tokenize it without adding special tokens.
 */
export function chatText(question: string, today: string): string {
  const turns = chatMessages(question, today).map((m) => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`);
  return `${turns.join('')}<|im_start|>assistant\n`;
}
