/**
 * Markdown 渲染（docs/design/security.md 渲染安全 + docs/design/chat.md）：
 * - react-markdown + remark-gfm；不启用 rehype-raw —— 模型输出中的原始 HTML 永不被渲染；
 * - highlight.js 核心与语言按需加载；流式期间代码保持纯文本，完成后最终高亮；
 * - 高亮产出的 HTML 经 DOMPurify 消毒后再注入；
 * - 代码块带复制按钮（顶部右侧，悬浮可见）。
 */
import { isValidElement, memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import { useTranslation } from 'react-i18next';
import { ensureHighlightLanguage } from './highlight-languages';

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

export const CodeBlock = memo(function CodeBlock({
  className,
  code,
  highlight = true,
}: {
  className?: string;
  code: string;
  highlight?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const rawLang = /language-([\w+-]+)/.exec(className ?? '')?.[1]?.toLowerCase() ?? '';
  const lang = LANG_ALIAS[rawLang] ?? rawLang;
  const [readyLang, setReadyLang] = useState(() => (lang && hljs.getLanguage(lang) ? lang : ''));

  useEffect(() => {
    let active = true;
    if (!highlight || !lang) {
      setReadyLang('');
      return () => {
        active = false;
      };
    }
    if (hljs.getLanguage(lang)) {
      setReadyLang(lang);
      return () => {
        active = false;
      };
    }
    setReadyLang('');
    void ensureHighlightLanguage(lang)
      .then(() => {
        if (active) setReadyLang(lang);
      })
      .catch(() => {
        // 语言加载失败时保留纯文本代码
      });
    return () => {
      active = false;
    };
  }, [highlight, lang]);

  const html = useMemo(() => {
    if (!highlight || readyLang !== lang || !lang || !hljs.getLanguage(lang)) return null;
    try {
      // 消毒红线：hljs 产出的 span 结构过 DOMPurify 后再注入
      return DOMPurify.sanitize(hljs.highlight(code, { language: lang }).value);
    } catch {
      return null;
    }
  }, [code, highlight, lang, readyLang]);

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
          fontSize: 'var(--font-code-size, 0.8125rem)',
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
});

/** 从 react-markdown 的 <pre> 子节点中提取 <code> 的 className 与纯文本 */
function extractCode(children: ReactNode): { className?: string; code: string } {
  const child = Array.isArray(children) && children.length === 1 ? children[0] : children;
  if (isValidElement<{ className?: string; children?: ReactNode }>(child)) {
    const { className, children: inner } = child.props;
    return { className, code: flattenText(inner).replace(/\n$/, '') };
  }
  return { code: flattenText(child).replace(/\n$/, '') };
}

function flattenText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return flattenText(node.props.children);
  return '';
}

const REMARK_PLUGINS = [remarkGfm];

export const Markdown = memo(function Markdown({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  const components = useMemo(
    () => ({
      pre({ children }: { children?: ReactNode }) {
        const { className, code } = extractCode(children);
        return <CodeBlock className={className} code={code} highlight={!streaming} />;
      },
      code({ children }: { children?: ReactNode }) {
        return <code className="md-inline">{children}</code>;
      },
      a({ href, children }: { href?: string; children?: ReactNode }) {
        return (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      },
    }),
    [streaming],
  );

  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});

export { extractCode };
