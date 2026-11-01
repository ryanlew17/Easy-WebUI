import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';

type LanguageLoader = () => Promise<{ default: LanguageFn }>;

const LOADERS: Record<string, LanguageLoader> = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  json: () => import('highlight.js/lib/languages/json'),
  bash: () => import('highlight.js/lib/languages/bash'),
  css: () => import('highlight.js/lib/languages/css'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  sql: () => import('highlight.js/lib/languages/sql'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  java: () => import('highlight.js/lib/languages/java'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  diff: () => import('highlight.js/lib/languages/diff'),
};

const pending = new Map<string, Promise<void>>();

/** @req REQ-2026-003 仅加载实际出现的语言，并复用并发加载。 */
export function ensureHighlightLanguage(lang: string): Promise<void> {
  if (hljs.getLanguage(lang) || !LOADERS[lang]) return Promise.resolve();
  const existing = pending.get(lang);
  if (existing) return existing;
  const loading = LOADERS[lang]()
    .then((module) => {
      hljs.registerLanguage(lang, module.default);
    })
    .finally(() => {
      pending.delete(lang);
    });
  pending.set(lang, loading);
  return loading;
}
