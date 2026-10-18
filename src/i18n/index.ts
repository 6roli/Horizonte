import { en, type StringKey, type Strings } from './en.ts';

const dictionaries: Record<string, Strings> = { en };

// Only English for now. When es.ts exists, pick the language from <html lang>
// or the URL, e.g. dictionaries[document.documentElement.lang] ?? en.
const active: Strings = dictionaries.en;

/** Translates a key and fills {placeholders}. */
export function t(key: StringKey, values: Record<string, string | number> = {}): string {
  return active[key].replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}

export const locale = 'en-GB';
