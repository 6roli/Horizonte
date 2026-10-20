/**
 * Fetches the weather warehouse snapshot in the browser.
 *
 * `referrerPolicy: 'no-referrer'` is required: Hugging Face answers 404 when
 * the request carries a Referer from a *.workers.dev page. public/_headers also
 * sets Referrer-Policy: no-referrer for the whole site as a second safeguard.
 */
import { WEATHER_SNAPSHOT_URL } from '../config/app.ts';
import { parseSnapshot, type WeatherSnapshot } from './snapshot.ts';

const REQUEST_TIMEOUT_MS = 15_000;

export async function loadSnapshot(url: string = WEATHER_SNAPSHOT_URL): Promise<WeatherSnapshot> {
  let response: Response;
  try {
    response = await fetch(url, {
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new Error(timedOut ? 'the weather warehouse did not answer in time' : 'the weather warehouse could not be reached');
  }
  if (!response.ok) throw new Error(`the weather warehouse answered ${response.status} ${response.statusText}`.trim());

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('the weather snapshot is not valid JSON');
  }
  return parseSnapshot(json);
}
