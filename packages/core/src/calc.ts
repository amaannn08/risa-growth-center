/** Safe calculator: recursive descent over numbers, + - * / % ^ ( ), unary minus, min/max/round/sqrt/abs. No eval. */
export type CalcResult = { value: number } | { error: string };

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt,
  round: (x, dp = 0) => { const f = 10 ** dp; return Math.round((x + Number.EPSILON) * f) / f; },
};

export function calc(expression: string): CalcResult {
  if (expression.length > 200) return { error: 'Expression too long' };
  // Thousands separators are only stripped when there are no function calls (where commas separate arguments).
  let src = expression.replace(/[₹]/g, '');
  if (!/[A-Za-z]/.test(src)) src = src.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
  let i = 0;
  const ws = () => { while (src[i] === ' ' || src[i] === '\t') i++; };
  const fail = (m: string): never => { throw new Error(m); };

  function expr(): number {
    let v = term();
    for (ws(); src[i] === '+' || src[i] === '-'; ws()) { const op = src[i++]; const r = term(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  function term(): number {
    let v = unary();
    for (ws(); src[i] === '*' || src[i] === '/' || src[i] === '%'; ws()) {
      const op = src[i++]; const r = unary();
      if ((op === '/' || op === '%') && r === 0) fail('Division by zero');
      v = op === '*' ? v * r : op === '/' ? v / r : v % r;
    }
    return v;
  }
  function unary(): number {
    ws();
    if (src[i] === '-') { i++; return -unary(); }
    if (src[i] === '+') { i++; return unary(); }
    return power();
  }
  function power(): number {
    const base = atom();
    ws();
    if (src[i] === '^') { i++; return base ** unary(); } // right-associative
    return base;
  }
  function atom(): number {
    ws();
    if (src[i] === '(') { i++; const v = expr(); ws(); if (src[i] !== ')') fail('Expected )'); i++; return v; }
    const num = /^\d+(\.\d+)?([eE][+-]?\d+)?|^\.\d+/.exec(src.slice(i));
    if (num) { i += num[0].length; return Number(num[0]); }
    const id = /^[A-Za-z_]\w*/.exec(src.slice(i));
    if (id) {
      const fn = FUNCS[id[0].toLowerCase()];
      if (!fn) fail(`Unknown identifier "${id[0]}"`);
      i += id[0].length; ws();
      if (src[i] !== '(') fail(`Expected ( after ${id[0]}`);
      i++;
      const args: number[] = [];
      ws();
      if (src[i] !== ')') for (;;) { args.push(expr()); ws(); if (src[i] === ',') { i++; continue; } break; }
      if (src[i] !== ')') fail('Expected )');
      i++;
      if (args.length === 0) fail(`${id[0]} needs arguments`);
      return fn!(...args);
    }
    return fail(i >= src.length ? 'Unexpected end of expression' : `Unexpected character "${src[i]}"`);
  }
  try {
    const v = expr(); ws();
    if (i < src.length) return { error: `Unexpected character "${src[i]}"` };
    if (!Number.isFinite(v)) return { error: 'Result is not a finite number' };
    return { value: v };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
