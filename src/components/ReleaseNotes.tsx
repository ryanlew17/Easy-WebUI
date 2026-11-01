/**
 * GitHub Release 摘要富文本（@req REQ-2026-002）。
 * raw HTML 仅在此组件经 rehype-sanitize 白名单消毒；聊天 Markdown 不启用该能力。
 */
import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { CodeBlock, extractCode } from './Markdown';

const RELEASE_TAGS = [
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'dd', 'del', 'details', 'div', 'dl',
  'dt', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'ins', 'kbd', 'li', 'mark', 'ol',
  'p', 'pre', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var',
];

const RELEASE_SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: RELEASE_TAGS,
  attributes: {
    ...defaultSchema.attributes,
    '*': ['title'],
    a: ['href', 'title'],
    code: ['className'],
    div: ['className'],
    span: ['className'],
    li: ['className'],
    details: ['open'],
    td: ['align'],
    th: ['align'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https'],
  },
};

function safeReleaseUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '';
}

const RELEASE_COMPONENTS: Components = {
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
};

export const ReleaseNotes = memo(function ReleaseNotes({ content }: { content: string }) {
  return (
    <div className="md text-xs leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeRaw], [rehypeSanitize, RELEASE_SANITIZE_SCHEMA]]}
        urlTransform={safeReleaseUrl}
        components={RELEASE_COMPONENTS}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
