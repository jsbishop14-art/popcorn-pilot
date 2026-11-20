// The stub catalog: fixture titles and placeholder cover art in catalog-stub/ (made by scripts/make-stub-catalog.mjs).
// Used until Josh enters a TMDB key, and always in CI and build sessions. Makes no outside calls.
import fs from 'node:fs';
import path from 'node:path';
import type { CatalogSource, Kind, Service, Title } from './types';

export function stubDir(): string {
  return process.env.PP_STUB_CATALOG_DIR || path.join(process.cwd(), 'catalog-stub');
}

let cache: { dir: string; titles: Title[] } | null = null;

export function stubTitles(): Title[] {
  const dir = stubDir();
  if (!cache || cache.dir !== dir) {
    const file = JSON.parse(fs.readFileSync(path.join(dir, 'titles.json'), 'utf8')) as { titles: Title[] };
    cache = { dir, titles: file.titles };
  }
  return cache.titles;
}

const byPopularity = (a: Title, b: Title) => b.popularity - a.popularity;

export const stubSource: CatalogSource = {
  name: 'stub',
  async list(service: Service, kind: Kind) {
    return stubTitles()
      .filter((t) => t.kind === kind && t.services.includes(service))
      .sort(byPopularity);
  },
  async search(q: string) {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return stubTitles()
      .filter((t) => t.name.toLowerCase().includes(needle))
      .sort(byPopularity);
  },
  async title(key: string) {
    return stubTitles().find((t) => t.key === key) ?? null;
  },
};
