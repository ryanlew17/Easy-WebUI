/**
 * Markdown 渲染（kimi.md §8.3 安全红线 + §4.1）：
 * - react-markdown + remark-gfm；不启用 rehype-raw —— 模型输出中的原始 HTML 永不被渲染；
 * - highlight.js 按需注册常见语言（lib/core 而非全量包）；
 * - 高亮产出的 HTML 经 DOMPurify 消毒后再注入；
 * - 代码块带复制按钮（顶部右侧，悬浮可见）。
 */
import { isValidElement, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import type { LanguageFn } from 'highlight.js';
import { useTranslation } from 'react-i18next';

/* highlight.js 按需注册（体积红线：不用全量 highlight.js） */
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import diff from 'highlight.js/lib/languages/diff';

const LANGS: [string, LanguageFn][] = [
  ['javascript', javascript],
  ['typescript', typescript],
  ['python', python],
  ['json', json],
  ['bash', bash],
  ['css', css],
  ['xml', xml],
  ['yaml', yaml],
  ['markdown', markdown],
  ['sql', sql],
  ['go', go],
  ['rust', rust],
  ['java', java],
  ['c', c],
  ['cpp', cpp],
  ['diff', diff],
];
for (const [name, def] of LANGS) {
  hljs.registerLanguage(name, def);
}

const LANG_ALIAS: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  html: 'xml',
  vue: 'xml',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  golang: 'go',
};

function CodeBlock({ className, code }: { className?: string; code: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const rawLang = /language-([\w+-]+)/.exec(className ?? '')?.[1]?.toLowerCase() ?? '';
  const lang = LANG_ALIAS[rawLang] ?? rawLang;

  const html = useMemo(() => {
    if (!lang || !hljs.getLanguage(lang)) return null;
    try {
      // 消毒红线：hljs 产出的 span 结构过 DOMPurify 后再注入
      return DOMPurify.sanitize(hljs.highlight(code, { language: lang }).value);
    } catch {
      return null;
    }
  }, [code, lang]);

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      /* 剪贴板不可用时静默 */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="group/code relative">
      <button
        type="button"
        onClick={() => void onCopy()}
        aria-label={t('aria.copyCode')}
        className="btn btn-surface absolute right-1.5 top-1.5 z-10 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/code:opacity-100"
        style={{ minHeight: '1.625rem', minWidth: '1.625rem', padding: '0 0.5rem', fontSize: '0.6875rem', background: 'var(--row-bg-active)' }}
      >
        {copied ? t('common.copied') : t('common.copy')}
      </button>
      <pre
        className="overflow-x-auto p-3 leading-relaxed"
        style={{
          /* --font-code-size：代码块字号（外观设置）覆盖入口；未设置时回退 0.8125rem */
          fontSize: 'var(--font-code-size, 0.8125rem)',
          /* --md-code-bg：代码块主题（外观设置）强制覆盖入口；未设置时回退 --code-bg */
          background: 'var(--md-code-bg, var(--code-bg))',
          borderRadius: 'var(--radius-control)',
          border: '0.5px solid var(--separator)',
        }}
      >
        {html ? (
          <code className={`hljs language-${lang}`} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}

/** 从 react-markdown 的 <pre> 子节点中提取 <code> 的 className 与纯文本 */
function extractCode(children: ReactNode): { className?: string; code: string } {
  if (isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    const { className, children: inner } = children.props;
    return { className, code: flattenText(inner).replace(/\n$/, '') };
  }
  return { code: flattenText(children).replace(/\n$/, '') };
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return flattenText(node.props.children);
  return '';
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 块级代码：走 CodeBlock（高亮 + 复制）；行内代码：纯样式
          pre({ children }) {
            const { className, code } = extractCode(children);
            return <CodeBlock className={className} code={code} />;
          },
          code({ children }) {
            return <code className="md-inline">{children}</code>;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
