import { Fragment, type ReactNode } from 'react';

// A small, safe Markdown renderer for admin-written pages (headings, paragraphs, lists, quotes,
// bold, italic, links). It builds React elements, so no HTML from the text is ever injected.

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={`${key}-${i++}`}>{m[2]}</strong>);
    else if (m[3]) out.push(<em key={`${key}-${i++}`}>{m[3]}</em>);
    else if (m[4]) {
      const href = m[5]!;
      const safe = /^(https?:|mailto:|tel:|\/)/.test(href) ? href : '#';
      out.push(
        <a key={`${key}-${i++}`} href={safe} className="text-accent underline underline-offset-2" {...(safe.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {m[4]}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushPara = () => {
    if (para.length) blocks.push(<p key={blocks.length}>{inline(para.join(' '), blocks.length)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={blocks.length} className={list.ordered ? 'list-decimal pl-6' : 'list-disc pl-6'}>
        {list.items.map((it, n) => (
          <li key={n}>{inline(it, n)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const li = /^\s*([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (h) {
      flushPara();
      flushList();
      const level = Math.min(4, h[1]!.length + 1);
      const cls = level === 2 ? 'font-serif text-3xl mt-8' : level === 3 ? 'font-serif text-2xl mt-6' : 'font-semibold text-lg mt-4';
      const Tag = `h${level}` as 'h2';
      blocks.push(<Tag key={blocks.length} className={cls}>{inline(h[2]!)}</Tag>);
    } else if (line.startsWith('>')) {
      flushPara();
      flushList();
      blocks.push(<blockquote key={blocks.length} className="border-l-2 border-gold pl-4 text-muted italic">{inline(line.replace(/^>\s?/, ''))}</blockquote>);
    } else if (li) {
      flushPara();
      const ordered = /\d/.test(li[1]!);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(li[2]!);
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className={className ?? 'flex flex-col gap-4 leading-relaxed'}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
