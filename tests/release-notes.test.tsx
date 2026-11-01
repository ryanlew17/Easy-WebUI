/**
 * GitHub Release 摘要富文本（@req REQ-2026-002）。
 * 验证 GFM/白名单 HTML、XSS 清除，以及聊天 raw HTML 禁令不变。
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReleaseNotes } from '../src/components/ReleaseNotes';
import { Markdown } from '../src/components/Markdown';

describe('ReleaseNotes', () => {
  it('渲染 GFM、白名单 HTML 与安全外链', () => {
    const content = [
      "## What's New",
      '',
      '- **Safer updates** and <strong>rich text</strong>',
      '',
      '| Area | Result |',
      '| --- | --- |',
      '| Renderer | `ready` |',
      '',
      '[Full release](https://github.com/ryanlew17/Easy-WebUI/releases/tag/v1.0.3)',
      '',
      '<details open><summary>More</summary><p>Sanitized details.</p></details>',
    ].join('\n');
    const html = renderToStaticMarkup(<ReleaseNotes content={content} />);
    expect(html).toContain('<h2>What&#x27;s New</h2>');
    expect(html).toContain('<strong>rich text</strong>');
    expect(html).toContain('<table>');
    expect(html).toContain('<code class="md-inline">ready</code>');
    expect(html).toContain(
      'href="https://github.com/ryanlew17/Easy-WebUI/releases/tag/v1.0.3"',
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('<details open="">');
    expect(html).toContain('<summary>More</summary>');
  });

  it('移除脚本、事件、危险 URL、表单和远程图片', () => {
    const content = [
      '[bad](javascript:alert(1))',
      '',
      '<img src="x" onerror="alert(1)">',
      '<script>alert(1)</script>',
      '<iframe src="https://example.com"></iframe>',
      '<form action="https://example.com"><button>Send</button></form>',
      '<a href="javascript:alert(1)" onclick="alert(1)">bad</a>',
      '![pixel](https://example.com/pixel.png)',
    ].join('\n');
    const html = renderToStaticMarkup(<ReleaseNotes content={content} />);
    for (const forbidden of [
      '<script',
      '<iframe',
      '<form',
      '<img',
      'onerror=',
      'onclick=',
      'javascript:',
    ]) {
      expect(html).not.toContain(forbidden);
    }
  });

  it('聊天 Markdown 仍不渲染 raw HTML', () => {
    const html = renderToStaticMarkup(<Markdown content={'<strong>raw</strong>'} />);
    expect(html).not.toContain('<strong>raw</strong>');
  });
});
