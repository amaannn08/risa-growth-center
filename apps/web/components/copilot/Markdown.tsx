import { Fragment, type ReactNode } from 'react';

const inline = (s: string): ReactNode[] =>
  s.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]*·[^\]]*\])/g).map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
    : p.startsWith('`') ? <code key={i} className="rounded bg-slate-100 px-1 text-[12px]">{p.slice(1, -1)}</code>
    : /^\[.*·.*\]$/.test(p) ? <span key={i} className="rounded bg-sky-50 px-1 text-[11px] text-sky-800">{p}</span>
    : <Fragment key={i}>{p}</Fragment>);

/** Minimal markdown: paragraphs, bullets, numbered lists, headings, pipe tables, bold, code, citations. */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (/^\s*\|.*\|\s*$/.test(l)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]!)) { rows.push(lines[i]!.trim().slice(1, -1).split('|').map((c) => c.trim())); i++; }
      i--;
      const body = rows.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      out.push(
        <div key={i} className="my-1 overflow-x-auto"><table className="w-full border-collapse text-xs tabular-nums">
          <thead><tr>{body[0]!.map((c, j) => <th key={j} className="border-b px-1.5 py-1 text-left font-semibold">{inline(c)}</th>)}</tr></thead>
          <tbody>{body.slice(1).map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className="border-b px-1.5 py-1">{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>);
    } else if (/^\s*[-*•]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*[-*•]\s+/, '')); i++; }
      i--;
      out.push(<ul key={i} className="my-1 list-disc pl-5">{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ul>);
    } else if (/^\s*\d+[.)]\s+/.test(l)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) { items.push(lines[i]!.replace(/^\s*\d+[.)]\s+/, '')); i++; }
      i--;
      out.push(<ol key={i} className="my-1 list-decimal pl-5">{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</ol>);
    } else if (/^#{1,4}\s+/.test(l)) out.push(<div key={i} className="mt-2 font-semibold">{inline(l.replace(/^#{1,4}\s+/, ''))}</div>);
    else if (l.trim()) out.push(<p key={i} className="my-1">{inline(l)}</p>);
  }
  return <div className="text-sm leading-snug">{out}</div>;
}
