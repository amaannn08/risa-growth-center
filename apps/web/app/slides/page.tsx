import { slideContent, snapshot } from '@gc/core';
import { getCtx } from '@/lib/data';
import { liveStrategy } from '@/lib/model';
import { historyFromDataset } from '@gc/core';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'RISA Growth Center — 3 slides' };

const A = '#4338ca'; // single accent
const Tag = ({ t }: { t: string }) => <span style={{ border: `1px solid ${A}`, color: A }} className="ml-2 inline-block rounded px-1.5 text-[16px] font-semibold align-middle">{t}</span>;
const H = ({ children }: { children: React.ReactNode }) => <div style={{ color: A }} className="mb-2 text-[24px] font-bold uppercase tracking-wide">{children}</div>;

function Frame({ n, title, children, url }: { n: number; title: string; children: React.ReactNode; url: string }) {
  return (
    <section className="slide relative bg-white text-slate-900" style={{ width: 1920, height: 1080, overflow: 'hidden', padding: '48px 64px', breakAfter: n < 3 ? 'page' : 'auto' }}>
      <div style={{ borderBottom: `4px solid ${A}` }} className="mb-5 pb-3">
        {n === 1 && <div className="text-[24px] font-medium text-slate-600">Aman Gupta · IIT Kharagpur · Challenge A: Attendee Growth</div>}
        <h1 className="text-[44px] font-extrabold leading-tight">{title}</h1>
      </div>
      {children}
      <div className="absolute bottom-6 left-16 right-16 flex justify-between text-[18px] text-slate-500">
        <span>Sources &amp; full calculations: README · Live: {url}</span>
        <span>S = sourced · D = from the 2025 dataset · A = assumption · {n}/3</span>
      </div>
    </section>
  );
}

export default async function Slides() {
  const ctx = await getCtx();
  const m = liveStrategy(ctx);
  const { visitors2025 } = historyFromDataset(ctx.ds);
  const s = snapshot(ctx.ds, ctx.covEnd, false).overall;
  const c = slideContent(m, { visitors2025, registeredShowUp2025: s.rates.registered_show_up ?? undefined, spend2025: s.marketing_spend_inr, siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://<deploy-url>' });
  const { slide1: s1, slide2: s2, slide3: s3 } = c;
  const th = 'border-b-2 border-slate-300 px-3 py-2 text-left text-[20px] font-semibold text-slate-700';
  const td = 'border-b border-slate-200 px-3 py-2 align-top text-[20px] leading-snug';
  return (
    <div className="bg-slate-200 print:bg-white">
      <style>{`
        @page { size: 13.333in 7.5in; margin: 0 }
        html, body { margin: 0; background: white }
        @media print { .slide { zoom: 0.666667; } }
        @media screen { .slide { margin: 16px auto; box-shadow: 0 2px 12px rgba(0,0,0,.2) } }
        /* web preview only: scale the fixed 1920x1080 frame to the viewport; the print frame above is untouched */
        @media screen and (max-width: 1999px) { .slide { zoom: 0.9 } }
        @media screen and (max-width: 1799px) { .slide { zoom: 0.75 } }
        @media screen and (max-width: 1499px) { .slide { zoom: 0.6 } }
        @media screen and (max-width: 1199px) { .slide { zoom: 0.5 } }
        @media screen and (max-width: 999px) { .slide { zoom: 0.4 } }
        @media screen and (max-width: 799px) { .slide { zoom: 0.3 } }
        @media screen and (max-width: 599px) { .slide { zoom: 0.19 } }
        .slide { font-family: var(--font-sans), system-ui, sans-serif; font-variant-numeric: tabular-nums }
      `}</style>

      <Frame n={1} title={s1.title} url={c.siteUrl}>
        <div className="grid grid-cols-3 gap-10" style={{ height: 800 }}>
          <div>
            <H>Why Bengaluru<Tag t="S" /></H>
            <ul className="space-y-3 text-[24px] leading-snug">
              {s1.why.map((w, i) => <li key={i} className="list-disc ml-6">{w.fact}</li>)}
              <li className="list-disc ml-6">Versus Mumbai, Delhi NCR, Chennai, Hyderabad/Pune: densest college base within one metro, an established intercollegiate-fest precedent and a metro-served venue.</li>
            </ul>
          </div>
          <div>
            <H>Audience &amp; funnel<Tag t="A" /></H>
            <table className="w-full border-collapse"><thead><tr><th className={th}></th><th className={th}>Base</th><th className={th}>Stretch</th></tr></thead>
              <tbody>{s1.funnel.map(([k, b, st], i) => {
                const last = k.startsWith('Unique');
                return <tr key={i} style={last ? { background: '#eef2ff', fontWeight: 700 } : undefined}><td className={td}>{k}</td><td className={td} colSpan={st ? 1 : 2}>{b}</td>{st && <td className={td}>{st}</td>}</tr>;
              })}</tbody></table>
            <div style={{ color: A }} className="mt-3 text-[26px] font-bold">{s1.growth}</div>
          </div>
          <div>
            <H>Why believe it</H>
            <ul className="space-y-3 text-[22px] leading-snug">{s1.believe.map((b, i) => <li key={i} className="list-disc ml-6">{b}</li>)}</ul>
            <div style={{ background: '#eef2ff', borderLeft: `6px solid ${A}` }} className="mt-5 px-4 py-3 text-[24px] font-semibold">Base {m.base.headline.toLocaleString('en-US')} · Stretch {m.stretch.headline.toLocaleString('en-US')} unique verified external visitors</div>
          </div>
        </div>
      </Frame>

      <Frame n={2} title={s2.title} url={c.siteUrl}>
        <div className="grid gap-8" style={{ gridTemplateColumns: '1300px 1fr', height: 800 }}>
          <div>
            <table className="w-full border-collapse"><thead><tr>{['#', 'Bet', 'Score', 'Mechanism', '+Visitors base / stretch', 'Budget', 'Owner · window'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{s2.bets.map((b) => (
                <tr key={b.id}><td className={td}>{b.rank}</td><td className={td + ' font-semibold'}>{b.name}</td>
                  <td className={td}><b style={{ color: A }}>{b.score}</b><div className="text-[16px] text-slate-500">I/C/E {b.ice}</div></td>
                  <td className={td + ' text-[17px]'}>{b.mechanism.split('. ')[0]!.replace(/\.$/, '')}.<div className="text-[15px] text-slate-500">{b.formula}</div></td>
                  <td className={td + ' font-semibold'}>{b.visitors}</td><td className={td}>{b.budget}</td><td className={td + ' text-[17px]'}>{b.owner}<div className="text-slate-500">{b.window}</div></td></tr>))}</tbody></table>
            <div className="mt-5"><H>Budget: ₹3,00,000 cap<Tag t="A" /></H>
              <div className="flex h-12 overflow-hidden rounded">
                {s2.budgetBar.map((x, i) => <div key={i} style={{ width: `${(x.value / m.base.cap) * 100}%`, background: ['#1e1b4b', A, '#a5b4fc'][i] }} />)}
              </div>
              <div className="mt-2 flex gap-8 text-[20px] font-semibold">
                {s2.budgetBar.map((x, i) => <span key={i} className="flex items-center gap-2"><span className="inline-block size-4 rounded-sm" style={{ background: ['#1e1b4b', A, '#a5b4fc'][i] }} />{x.label.split(' (')[0]}</span>)}
              </div>
              <div className="mt-2 text-[20px] text-slate-700">{s2.budgetNote}</div>
            </div>
          </div>
          <div className="space-y-5">
            <div style={{ background: '#eef2ff', borderLeft: `6px solid ${A}` }} className="px-4 py-3 text-[22px] font-semibold">{s2.double}</div>
            <div><H>Deprioritize / reject ({s2.rejectedCount} considered)</H><ul className="space-y-1 text-[22px]">{s2.reject.map((r, i) => <li key={i} className="list-disc ml-6">{r}</li>)}</ul></div>
            <div><H>Constraints &amp; overlap</H><p className="text-[21px] leading-snug">{s2.constraints}</p></div>
            <div><H>Reference re-allocation</H><p className="text-[21px] leading-snug">Paid Social ₹93k → ₹35k · Creator Partners ₹59k → ₹23k; five strong cohorts unchanged at ₹122k.</p></div>
            <div><H>Framework</H><p className="text-[21px] leading-snug">{s2.framework}</p></div>
          </div>
        </div>
      </Frame>

      <Frame n={3} title={s3.title} url={c.siteUrl}>
        <div className="grid gap-8" style={{ gridTemplateColumns: '1250px 1fr', height: 800 }}>
          <div>
            <table className="w-full border-collapse"><thead><tr>{['Bet', 'Critical variable · leading signal', 'Scale', 'Change', 'Stop'].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{s3.thresholds.map((t) => (
                <tr key={t.bet}><td className={td + ' font-semibold'}>{t.bet}<div className="text-[16px] font-normal text-slate-500">{t.name}</div></td>
                  <td className={td + ' text-[17px]'}>{t.kpi}<div className="text-[15px] text-slate-500">Risk: {t.risk} · Signal: {t.leading}</div></td>
                  <td className={td + ' text-[18px] font-semibold'} style={{ color: '#047857' }}>{t.scale}</td><td className={td + ' text-[17px]'}>{t.change}</td><td className={td + ' text-[17px]'} style={{ color: '#b91c1c' }}>{t.stop}</td></tr>))}</tbody></table>
            <div className="mt-4 text-[21px] leading-snug"><b style={{ color: A }}>Cadence.</b> {s3.cadence}</div>
            <div className="mt-3 flex items-center gap-2 text-[19px]">{s3.ladder.map((l, i) => <span key={i} className="flex items-center gap-2"><span style={{ border: `2px solid ${A}` }} className="rounded px-3 py-1.5">{l}</span>{i < s3.ladder.length - 1 && <span style={{ color: A }}>→</span>}</span>)}</div>
            <div className="mt-3 text-[20px]"><b style={{ color: A }}>Hygiene.</b> {s3.hygiene}</div>
          </div>
          <div>
            <H>Growth Center loop</H>
            <ol className="space-y-3 text-[21px] leading-snug">{s3.loop.map((l, i) => <li key={i} className="flex gap-3"><span style={{ background: A }} className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white">{i + 1}</span>{l}</li>)}</ol>
          </div>
        </div>
      </Frame>
    </div>
  );
}
