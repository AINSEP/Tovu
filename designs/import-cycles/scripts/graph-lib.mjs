export function scc(nodes, adj) {
  let idx = 0; const index = new Map(), low = new Map(), on = new Set(), st = [], out = [];
  const strong = (v0) => {
    const work = [[v0, 0]];
    index.set(v0, idx); low.set(v0, idx); idx++; st.push(v0); on.add(v0);
    while (work.length) {
      const top = work[work.length - 1]; const [v, i] = top; const ns = adj.get(v) || [];
      if (i < ns.length) {
        top[1]++; const w = ns[i];
        if (!index.has(w)) { index.set(w, idx); low.set(w, idx); idx++; st.push(w); on.add(w); work.push([w, 0]); }
        else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
      } else {
        work.pop();
        if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
        if (low.get(v) === index.get(v)) { const comp = []; let w; do { w = st.pop(); on.delete(w); comp.push(w); } while (w !== v); out.push(comp); }
      }
    }
  };
  for (const v of nodes) if (!index.has(v)) strong(v);
  return out;
}
