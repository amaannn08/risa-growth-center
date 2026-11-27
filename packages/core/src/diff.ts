/** Deep compare used by golden tests and `db:verify`. Numbers within 1e-7; strings/null exact; extra/missing keys reported. */
export function deepDiff(exp: any, act: any, path = '$', out: string[] = []): string[] {
  if (out.length > 10) return out;
  if (typeof exp === 'number') {
    if (typeof act !== 'number' || Math.abs(exp - act) > 1e-7) out.push(`${path}: expected ${exp}, got ${act}`);
  } else if (exp === null || typeof exp !== 'object') {
    if (exp !== act) out.push(`${path}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`);
  } else if (Array.isArray(exp)) {
    if (!Array.isArray(act) || act.length !== exp.length) out.push(`${path}: array length ${exp.length} vs ${act?.length}`);
    else exp.forEach((e, i) => deepDiff(e, act[i], `${path}[${i}]`, out));
  } else {
    if (act === null || typeof act !== 'object') { out.push(`${path}: expected object, got ${act}`); return out; }
    for (const k of Object.keys(exp)) {
      if (!(k in act)) out.push(`${path}.${k}: missing`);
      else deepDiff(exp[k], act[k], `${path}.${k}`, out);
    }
    for (const k of Object.keys(act)) if (!(k in exp)) out.push(`${path}.${k}: unexpected key`);
  }
  return out;
}
