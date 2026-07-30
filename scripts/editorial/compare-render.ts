// Pure rendering for the calibration bench. No filesystem and no path resolution,
// so both the CLI in compare.ts and the localhost admin route can call it. Keeping
// one renderer is the point: a second implementation would drift from the first the
// moment either changed.

type ReasonKind = "applied" | "kept" | "cut" | "error" | "cost" | "remaining";

export interface Generation {
  label: string;
  derivedFrom?: string;
  status: "rejected" | "basis" | "candidate" | "approved";
  title?: string;
  text: string[];
  reasoning?: { kind: ReasonKind; note: string }[];
}

export interface CalibrationRecord {
  schemaVersion: number;
  sectionId: string;
  editorialId: string;
  sectionHeading: string;
  status: "open" | "settled" | "superseded";
  baseline: { batchId: string; path: string; sha256?: string };
  effectiveVoiceCard?: { source: string; claim: string }[];
  voiceCard?: { line: number; claim: string; by: Record<string, boolean | null> }[];
  rulesInForce?: { id: string; obligation: string }[];
  findings?: { id: string; summary: string }[];
  generations: Generation[];
  rulings?: { id: string; question: string; decision: string; scope: string }[];
  openQuestions?: string[];
}

export function extractSection(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const target = heading.trim().toLowerCase();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i] ?? "");
    if (!m) continue;
    if ((m[2] ?? "").trim().toLowerCase() === target) {
      start = i + 1;
      level = (m[1] ?? "").length;
      break;
    }
  }
  if (start < 0) return [];
  const body: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const m = /^(#{1,6})\s+/.exec(line);
    if (m && (m[1] ?? "").length <= level) break;
    if (/^---+$/.test(line.trim())) break;
    body.push(line);
  }
  // Paragraphs only. Display matter and breath marks are not prose under comparison.
  return body
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^[.:\s]+$/.test(p) && !/^\*\*/.test(p) && !/^>/.test(p));
}

const esc = (s: string): string =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export const wordsOf = (t: string): string[] => t.match(/[A-Za-z0-9'’-]+/g) ?? [];
const sentencesOf = (t: string): string[] =>
  t.split(/(?<=[.:!?])\s+/).map((s) => s.trim()).filter(Boolean);

export function diffWords(a: string, b: string): string {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]!;
    const next = dp[i + 1]!;
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = A[i] === B[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const a = A[i] ?? "";
    const b = B[j] ?? "";
    if (a === b) { out.push(esc(a)); i += 1; j += 1; }
    else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) { if (a.trim()) out.push(`<del>${esc(a)}</del>`); i += 1; }
    else { out.push(b.trim() ? `<ins>${esc(b)}</ins>` : b); j += 1; }
  }
  while (i < n) { const a = A[i] ?? ""; if (a.trim()) out.push(`<del>${esc(a)}</del>`); i += 1; }
  while (j < m) { const b = B[j] ?? ""; out.push(b.trim() ? `<ins>${esc(b)}</ins>` : b); j += 1; }
  return out.join("");
}

interface Rendered extends Generation {
  key: string;
  words: number;
  sentences: number;
  pct: number;
  emDashes: number;
  cadence: { n: number; end: boolean }[];
  col?: number;
  row?: number;
  span?: number;
  plain: string[];
  diff: string[];
}

function measure(text: string[], baseWords: number, base: string[] | null): Omit<Rendered, keyof Generation | "key" | "col" | "row"> {
  const words = text.flatMap(wordsOf).length;
  return {
    words,
    sentences: text.flatMap(sentencesOf).length,
    pct: baseWords ? Math.round(((words - baseWords) / baseWords) * 100) : 0,
    emDashes: text.join(" ").split("—").length - 1,
    cadence: text.flatMap((p, pi) =>
      sentencesOf(p).map((s, si, arr) => ({ n: wordsOf(s).length, end: si === arr.length - 1 && pi < text.length - 1 }))),
    plain: text.map(esc),
    diff: base ? text.map((p, i) => diffWords(base[i] ?? "", p)) : text.map(esc),
  };
}

const CHIP: Record<string, string> = {
  basis: "basis", rejected: "not approved", candidate: "candidate", approved: "approved", reference: "reference",
};

export function render(record: CalibrationRecord, baseText: string[], currentText: string[]): string {
  const baseWords = baseText.flatMap(wordsOf).length;

  const baseRow = {
    key: "baseline", label: "Baseline", title: "Original", status: "reference" as const,
    text: baseText, ...measure(baseText, baseWords, null),
  };

  const shipped: Rendered = {
    key: "shipped", label: "Shipped", title: "The current pass", status: "rejected",
    text: currentText, reasoning: [{ kind: "remaining", note: "The pass this calibration replaces. Retained for reference." }],
    ...measure(currentText, baseWords, baseText),
  } as Rendered;

  // A generation without text is a record of a decision rather than a candidate
  // rendering. Most re-render records are that shape: one approved generation carrying
  // only its reasoning, because there was never a second version to compare it with.
  // Measuring one would read undefined, which is how the bench used to crash on every
  // record except the founding session.
  const gens: Rendered[] = record.generations
    .filter((g) => Array.isArray(g.text))
    .map((g) => ({
      ...g,
      key: g.label.toLowerCase().replace(/\s+/g, "-"),
      ...measure(g.text, baseWords, baseText),
    })) as Rendered[];

  // Lineage grid. Depth sets the row. Columns are allocated by walking the tree so
  // that siblings sit side by side and never collide in one cell: a leaf takes the
  // next free column, and a parent adopts its first child's column so descent reads
  // as a straight vertical line.
  const byLabel = new Map(gens.map((g) => [g.label, g]));
  const childrenOf = new Map<string, Rendered[]>();
  const roots: Rendered[] = [];
  for (const g of gens) {
    const parent = g.derivedFrom ? byLabel.get(g.derivedFrom) : undefined;
    if (!parent) { roots.push(g); continue; }
    const siblings = childrenOf.get(parent.label) ?? [];
    siblings.push(g);
    childrenOf.set(parent.label, siblings);
  }
  // A leaf occupies one column. A parent spans the full width of its children, so it
  // sits visually above every one of them and siblings never appear orphaned under
  // empty space. Depth sets the row, so the vertical axis stays strictly generational.
  let nextCol = 0;
  const place = (node: Rendered, depth: number): void => {
    node.row = depth;
    const kids = childrenOf.get(node.label) ?? [];
    if (kids.length === 0) {
      nextCol += 1;
      node.col = nextCol;
      node.span = 1;
      return;
    }
    for (const kid of kids) place(kid, depth + 1);
    node.col = kids[0]?.col ?? 1;
    node.span = kids.reduce((total, kid) => total + (kid.span ?? 1), 0);
  };
  for (const root of roots) place(root, 1);
  const all = [...gens, shipped];
  const candidate = gens.find((g) => g.status === "candidate" || g.status === "approved") ?? gens[gens.length - 1];
  const maxBar = Math.max(...[baseRow, ...all].flatMap((v) => v.cadence.map((c) => c.n)), 1);

  const bars = (v: { cadence: { n: number; end: boolean }[] }): string =>
    v.cadence.map((c) =>
      `<div class="bar-row"><span class="bar-n">${c.n}</span><div class="bar${c.end ? " para-end" : ""}" style="width:${Math.max(2, (c.n / maxBar) * 100)}%"></div></div>`).join("");

  const prose = (src: string[]): string => src.map((p) => `<p>${p}</p>`).join("");

  const pane = (v: typeof baseRow | Rendered, active: boolean, pinned: boolean): string => `
<section class="pane sheet${active ? " active" : ""}" data-version="${v.key}"${pinned ? ' data-pinned="1"' : ""}>
  <div class="pane-head">
    <span class="pane-label">${esc(v.label)}</span>
    <span class="pane-title">${esc(v.title ?? "")}</span>
    ${v.status && CHIP[v.status] ? `<span class="chip chip-${v.status}">${CHIP[v.status]}</span>` : ""}
    ${"derivedFrom" in v && v.derivedFrom ? `<span class="chip chip-derived">from ${esc(v.derivedFrom)}</span>` : ""}
    ${v.emDashes ? `<span class="chip chip-warn">${v.emDashes} em dash${v.emDashes > 1 ? "es" : ""}</span>` : ""}
    <span class="metrics"><b>${v.words}</b> words${pinned ? "" : ` <span class="delta ${v.pct < 0 ? "neg" : "pos"}">${v.pct > 0 ? "+" : ""}${v.pct}%</span>`} &middot; <b>${v.sentences}</b> sentences</span>
  </div>
  <div class="prose">${prose(v.plain)}</div>
  <div class="prose diffed">${prose(v.diff)}</div>
  <div class="cadence"><div class="micro">Cadence</div><div class="bars">${bars(v)}</div></div>
</section>`;

  const reason = (v: Rendered): string => `
<section class="reason${v.key === candidate?.key ? " active" : ""}" data-version="${v.key}">
  <dl class="moves">${(v.reasoning ?? []).map((r) => `<dt>${esc(r.kind)}</dt><dd>${esc(r.note)}</dd>`).join("")}</dl>
</section>`;

  const tick = (s: boolean | null | undefined): string =>
    s === true ? '<span class="ok">&#10003;</span>' : s === false ? '<span class="bad">&#10007;</span>' : '<span class="na">&middot;</span>';

  return `<title>${esc(record.sectionHeading)} | calibration</title>
<style>
:root{
--paper:#f4ead7;--paper-soft:#fbf6eb;--ink:#13202a;--ink-soft:#4f4d49;--ink-muted:#5a666c;
--bronze:#a47b3f;--bronze-deep:#77542a;--sage:#60796d;
--line:rgba(119,84,42,.24);--line-soft:rgba(119,84,42,.13);--panel:#fbf6eb;
--cut:#8c4a33;--add:rgba(164,123,63,.20);--cut-bg:rgba(140,74,51,.13);--radius:12px;
--serif:Literata,Georgia,"Iowan Old Style",serif;color-scheme:light;}
*{box-sizing:border-box}
html,body{overflow:hidden}
body{margin:0;background:transparent;color:var(--ink);font-family:var(--serif);
 -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.wrap{max-width:none;margin:0;padding:2px 0 12px}
.micro{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);opacity:.85}
.bench-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:36px;align-items:end;
 padding:9px 2px 23px;border-bottom:1px solid var(--line)}
.identity{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:9px;
 font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--ink-muted)}
.status{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(96,121,109,.35);
 border-radius:999px;padding:3px 8px;color:var(--sage);font-weight:700}
.status::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;
 box-shadow:0 0 0 3px rgba(96,121,109,.12)}
.bench-hero h1{font-size:clamp(30px,4vw,48px);font-weight:500;letter-spacing:-.035em;
 line-height:1;margin:0}
.hero-note{max-width:68ch;margin:11px 0 0;color:var(--ink-muted);font-size:13.5px;line-height:1.55}
.hero-stats{display:grid;grid-template-columns:repeat(3,auto);gap:24px;margin:0}
.hero-stats div{display:grid;gap:1px}
.hero-stats dt{font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-muted)}
.hero-stats dd{margin:0;color:var(--ink);font-size:20px;line-height:1.1}
.hero-stats small{font-size:10px;color:var(--ink-muted)}
.sheet{background:rgba(251,246,235,.84);border:1px solid var(--line);border-radius:var(--radius);
 box-shadow:0 10px 30px rgba(59,42,24,.035)}
.selector-shell{margin-top:16px;padding:16px}
.selector-head{display:flex;align-items:flex-start;justify-content:space-between;gap:22px;
 padding:0 1px 13px;border-bottom:1px solid var(--line-soft)}
.selector-head h2{margin:3px 0 2px;font-size:17px;font-weight:600}
.selector-help{max-width:70ch;margin:0;color:var(--ink-muted);font-size:12px;line-height:1.45}
.toggle{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;border:1px solid var(--line);
 border-radius:999px;padding:7px 10px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
 color:var(--ink-muted);cursor:pointer;user-select:none;background:var(--paper-soft)}
.toggle:hover{color:var(--ink);border-color:var(--bronze)}
.toggle input{accent-color:var(--bronze-deep);margin:0}
.tabgrid{display:grid;gap:7px;padding:14px 0 4px}
.tab{display:inline-flex;align-items:center;justify-content:center;gap:6px;font-family:var(--serif);
 font-size:13px;border:1px solid var(--line-soft);background:rgba(244,234,215,.45);color:var(--ink-muted);
 cursor:pointer;padding:8px 10px;border-radius:8px;text-align:center;position:relative;
 transition:background .14s ease,border-color .14s ease,color .14s ease,transform .14s ease}
.tab:hover{color:var(--ink);border-color:var(--bronze);transform:translateY(-1px)}
.tab[aria-selected="true"]{background:var(--bronze-deep);border-color:var(--bronze-deep);color:var(--paper-soft)}
.tab.is-basis{box-shadow:inset 0 -3px 0 var(--bronze);color:var(--ink);background:var(--paper-soft)}
.tab.is-basis[aria-selected="true"]{box-shadow:none}
.tab.is-rejected{text-decoration:line-through;text-decoration-thickness:1px;opacity:.5}
.tab.derived::before{content:"";position:absolute;left:50%;top:-8px;width:1px;height:8px;background:var(--bronze)}
.approval-mark{width:13px;height:13px;flex:0 0 auto;color:var(--sage);fill:none;
 stroke:currentColor;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}
.tab[aria-selected="true"] .approval-mark{color:var(--paper-soft)}
.selector-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:10px;
 padding-top:10px;border-top:1px solid var(--line-soft)}
.selector-foot p{margin:0;color:var(--ink-muted);font-size:11px;line-height:1.4}
.refrow{flex:0 0 min(220px,36%)}
.refrow .tab{width:100%;font-style:italic}
.bench{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;margin-top:16px}
.body-left,.body-right{min-width:0}
.pane{overflow:hidden}
.pane.active{border-color:rgba(119,84,42,.42);box-shadow:0 12px 34px rgba(59,42,24,.055)}
.pane-head{display:flex;align-items:baseline;gap:9px;padding:12px 16px;border-bottom:1px solid var(--line-soft);flex-wrap:wrap}
.pane-label{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-muted)}
.pane-title{font-size:14.5px;font-weight:600}
.metrics{margin-left:auto;font-size:11.5px;color:var(--ink-muted);white-space:nowrap}
.metrics b{color:var(--ink);font-weight:600}
.delta.neg{color:var(--cut)}.delta.pos{color:var(--sage)}
.prose{font-size:16px;line-height:1.7;padding:20px 22px 21px}
.prose p{margin:0 0 1em;max-width:74ch}
.prose p:last-child{margin-bottom:0}
ins{background:var(--add);text-decoration:none}
del{background:var(--cut-bg);color:var(--cut);text-decoration:line-through;text-decoration-thickness:1px}
.cadence{padding:0 22px 18px}
.cadence .micro{margin-bottom:7px}
.bars{display:flex;flex-direction:column;gap:3px}
.bar-row{display:flex;align-items:center;gap:8px}
.bar{height:5px;border-radius:3px;background:var(--bronze);opacity:.62;min-width:3px}
.bar.para-end{background:var(--ink-muted);opacity:.42}
.bar-n{font-size:10px;color:var(--ink-muted);min-width:17px}
.chip{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--ink-muted);white-space:nowrap}
.chip-basis{border-color:var(--bronze);color:var(--bronze-deep)}
.chip-candidate,.chip-approved{background:var(--bronze-deep);border-color:var(--bronze-deep);color:var(--paper-soft)}
.chip-rejected{text-decoration:line-through;opacity:.7}
.chip-warn{color:var(--cut);border-color:var(--cut)}
.reasoning-block{margin-top:16px;padding:18px 20px}
.reasoning-head{display:flex;align-items:baseline;justify-content:space-between;gap:20px;
 margin-bottom:13px;padding-bottom:11px;border-bottom:1px solid var(--line-soft)}
.reasoning-head h2{margin:2px 0 0;font-size:17px;font-weight:600}
.reasoning-head span{color:var(--ink-muted);font-size:11px}
.evidence{margin-top:28px}
.evidence-head{display:flex;align-items:end;justify-content:space-between;gap:24px;margin-bottom:11px}
.evidence-head h2{margin:3px 0 0;font-size:18px;font-weight:600}
.evidence-head p{max-width:62ch;margin:0;color:var(--ink-muted);font-size:12px;line-height:1.5;text-align:right}
.evidence-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.evidence-card{border:1px solid var(--line);border-radius:10px;background:rgba(251,246,235,.72);
 overflow:hidden}
.evidence-card summary{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;
 padding:13px 15px;cursor:pointer;list-style:none}
.evidence-card summary::-webkit-details-marker{display:none}
.evidence-card summary::after{content:"+";display:grid;place-items:center;width:22px;height:22px;
 border:1px solid var(--line);border-radius:50%;color:var(--bronze-deep);font-size:16px;line-height:1}
.evidence-card[open] summary::after{content:"−"}
.evidence-card[open] summary{border-bottom:1px solid var(--line-soft)}
.evidence-card summary strong{display:block;font-size:13px;font-weight:600}
.evidence-card summary small{display:block;margin-top:2px;color:var(--ink-muted);font-size:10.5px}
.evidence-body{padding:15px 17px 17px}
.explain{margin:0 0 11px;font-size:12.5px;line-height:1.55;color:var(--ink-muted);max-width:70ch}
.explain code{font-size:11.5px;color:var(--bronze-deep)}
.moves{margin:0;display:grid;grid-template-columns:auto 1fr;gap:7px 14px;font-size:13.5px;line-height:1.5}
.moves dt{color:var(--bronze-deep);font-size:11px;letter-spacing:.08em;text-transform:uppercase;padding-top:3px;white-space:nowrap}
.moves dd{margin:0;color:var(--ink-soft)}
.vc{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.vc li{display:grid;grid-template-columns:auto 1fr;gap:10px;font-size:13.5px;line-height:1.5;color:var(--ink-soft)}
.vc .lineno{font-size:10.5px;color:var(--ink-muted);padding-top:3px}
.vc .claim{color:var(--ink)}
.vc .states{margin-top:5px;display:flex;gap:9px;flex-wrap:wrap;font-size:11px}
.ok{color:var(--sage)}.bad{color:var(--cut)}.na{color:var(--ink-muted);opacity:.6}
.rules{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:7px;font-size:13px;line-height:1.5}
.rules li{display:grid;grid-template-columns:auto 1fr;gap:11px;color:var(--ink-soft)}
.rules .rid{color:var(--bronze-deep);font-size:11px;padding-top:2px}
.legend{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
.legend li{display:flex;gap:11px;align-items:center;font-size:12.5px;color:var(--ink-soft)}
.key{flex:0 0 26px;height:13px;border-radius:4px;border:1px solid var(--line);position:relative}
.key-basis{box-shadow:inset 0 -2px 0 var(--bronze)}
.key-rejected{opacity:.5}
.key-rejected::after{content:"";position:absolute;left:3px;right:3px;top:50%;height:1px;background:var(--ink-muted)}
.key-candidate{background:var(--bronze-deep);border-color:var(--bronze-deep)}
.key-descent::after{content:"";position:absolute;left:50%;top:-5px;height:5px;width:1px;background:var(--bronze)}
.open-questions{grid-column:1 / -1;border-color:rgba(140,74,51,.3)}
.open-questions summary strong{color:var(--cut)}
.diffed{display:none}
.js .pane[data-version]:not([data-pinned]){display:none}
.js .pane[data-version].active{display:block}
.js .reason[data-version]{display:none}
.js .reason[data-version].active{display:block}
.js.showdiff .prose:not(.diffed){display:none}
.js.showdiff .diffed{display:block}
.js .nojs{display:none}
.nojs{font-size:11.5px;color:var(--ink-muted);margin:10px 0 0}
@media (max-width:880px){
 .bench-hero{grid-template-columns:1fr;gap:18px}.hero-stats{justify-content:start}
 .selector-head,.selector-foot,.evidence-head{align-items:flex-start;flex-direction:column}
 .selector-foot p,.evidence-head p{text-align:left}.refrow{width:100%;max-width:none}
 .bench,.evidence-grid{grid-template-columns:1fr}
}
@media (max-width:560px){
 .bench-hero h1{font-size:32px}.hero-stats{width:100%;grid-template-columns:repeat(3,1fr);gap:10px}
 .selector-shell{padding:12px}.tab{font-size:11px;padding:7px 4px}
 .prose{font-size:15.5px;padding:17px}.cadence{padding:0 17px 16px}
 .pane-head{align-items:flex-start}.metrics{width:100%;margin-left:0}
}
</style>
<div class="wrap">
<header class="bench-hero">
  <div>
    <div class="identity">
      <span class="status">${esc(record.status)}</span>
      <span>${esc(record.editorialId)}</span>
      <span>${esc(record.sectionId)}</span>
    </div>
    <h1>${esc(record.sectionHeading)}</h1>
    <p class="hero-note">Trace the branch that won, compare it with the protected baseline, and inspect the reasoning behind each decision.</p>
  </div>
  <dl class="hero-stats">
    <div><dt>Baseline</dt><dd>${baseWords}</dd><small>words</small></div>
    <div><dt>Variants</dt><dd>${gens.length}</dd><small>rendered</small></div>
    <div><dt>Findings</dt><dd>${record.findings?.length ?? 0}</dd><small>recorded</small></div>
  </dl>
</header>

<section class="sheet selector-shell" aria-labelledby="lineage-heading">
  <div class="selector-head">
    <div>
      <div class="micro">Revision lineage</div>
      <h2 id="lineage-heading">Follow the decision tree</h2>
      <p class="selector-help">Select any branch to compare it with the pinned baseline. The approved branch carries a checkmark. Vertical connectors show direct descent.</p>
    </div>
    <label class="toggle"><input type="checkbox" id="diffToggle"> Show word changes</label>
  </div>
    <div class="tabgrid" role="tablist" style="grid-template-columns:repeat(${Math.max(nextCol, 1)},minmax(0,1fr))">
      ${gens.map((g) => {
        // The descent connector only reads correctly for a child sitting directly
        // beneath its parent. Siblings placed in adjacent columns get none.
        const p = g.derivedFrom ? byLabel.get(g.derivedFrom) : undefined;
        const inline = p ? " derived" : "";
        const approved = g.status === "approved";
        const approvalMark = approved
          ? '<svg class="approval-mark" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8.4 3.1 3.1L13 4.8"></path></svg>'
          : "";
        return `<button class="tab is-${g.status}${inline}" role="tab" aria-label="${esc(g.label)}${approved ? ", approved" : ""}" aria-selected="${g.key === candidate?.key}" data-target="${g.key}" style="grid-column:${g.col} / span ${g.span ?? 1};grid-row:${g.row}"><span>${esc(g.label)}</span>${approvalMark}</button>`;
      }).join("")}
    </div>
    <div class="selector-foot">
      <p>Basis branches carry a bronze underline. Rejected branches remain visible because discarded reasoning is still evidence.</p>
      <div class="refrow"><button class="tab is-reference" role="tab" aria-selected="false" data-target="shipped">View shipped pass</button></div>
    </div>
</section>

<div class="bench">
  <div class="body-left">${pane(baseRow, true, true)}</div>
  <div class="body-right">
    ${all.map((v) => pane(v, v.key === candidate?.key, false)).join("")}
  </div>
</div>

<section class="sheet reasoning-block" aria-labelledby="reasoning-heading">
  <div class="reasoning-head">
    <div>
      <div class="micro">Editorial rationale</div>
      <h2 id="reasoning-heading">Why this variant reads as it does</h2>
    </div>
    <span>Updates with the selected branch</span>
  </div>
  ${all.map(reason).join("")}
  <p class="nojs">Scripting is unavailable, so every variant and its reasoning are shown and word changes are hidden.</p>
</section>

<section class="evidence" aria-labelledby="evidence-heading">
  <header class="evidence-head">
    <div>
      <div class="micro">Decision evidence</div>
      <h2 id="evidence-heading">Constraints behind the comparison</h2>
    </div>
    <p>Open the evidence you need. The comparison stays primary while every binding rule remains available for inspection.</p>
  </header>
  <div class="evidence-grid">
    ${record.effectiveVoiceCard?.length ? `<details class="evidence-card">
      <summary><span><strong>Corpus commitments</strong><small>${record.effectiveVoiceCard.length} shared rules in force</small></span></summary>
      <div class="evidence-body">
      <p class="explain">The volume card is an overlay on the shared corpus voice card. These rules bind every volume unless an explicit recorded delta makes the local rule narrower or stronger.</p>
      <ul class="rules">${record.effectiveVoiceCard.map((rule) =>
      `<li><span class="rid">${esc(rule.source)}</span><span>${esc(rule.claim)}</span></li>`).join("")}</ul>
      </div>
    </details>` : ""}
    ${record.voiceCard?.length ? `<details class="evidence-card">
      <summary><span><strong>Volume voice requirements</strong><small>${record.voiceCard.length} claims checked across the lineage</small></span></summary>
      <div class="evidence-body">
      <p class="explain">Every volume keeps its local overlay at <code>editorial/sources/volumes/${esc(record.editorialId)}/voice-card.md</code>. Under <code>R-VOICE-BIND</code>, the effective corpus plus volume card is binding rather than advisory. The claims below are quoted from the volume overlay, with the line each sits on. A cross means the variant contradicts a claim the card makes, which is a defect however well the sentence reads on its own.</p>
      <ul class="vc">${record.voiceCard.map((a) =>
      `<li><span class="lineno">L${a.line}</span><span><span class="claim">${esc(a.claim)}</span><span class="states">${gens.map((g) =>
        `<span>${tick(a.by[g.key] ?? a.by[g.label])} ${esc(g.label)}</span>`).join("")}</span></span></li>`).join("")}</ul>
      <p class="explain">A dot means the claim no longer applies to these variants, usually because an author ruling released it.</p>
      </div>
    </details>` : ""}
    ${record.rulesInForce?.length ? `<details class="evidence-card">
      <summary><span><strong>Editorial rules in force</strong><small>${record.rulesInForce.length} named obligations</small></span></summary>
      <div class="evidence-body">
      <p class="explain">Named obligations from <code>editorial/method/standard.md</code>. Each was derived from a recorded calibration, so every rule here can be traced to the passage that exposed the need for it.</p>
      <ul class="rules">${record.rulesInForce.map((r) =>
      `<li><span class="rid">${esc(r.id)}</span><span>${esc(r.obligation)}</span></li>`).join("")}</ul>
      </div>
    </details>` : ""}
    <details class="evidence-card">
      <summary><span><strong>Selector guide</strong><small>How to read lineage states</small></span></summary>
      <div class="evidence-body">
      <ul class="legend">
        <li><span class="key key-basis"></span>a basis further variants derive from</li>
        <li><span class="key key-rejected"></span>considered and not approved</li>
        <li><span class="key key-candidate"></span>the current candidate</li>
        <li><span class="key key-descent"></span>stacked below its parent, one generation down</li>
      </ul>
      </div>
    </details>
    ${record.openQuestions?.length ? `<details class="evidence-card open-questions" open>
      <summary><span><strong>Open questions</strong><small>${record.openQuestions.length} decisions still unresolved</small></span></summary>
      <div class="evidence-body"><ul class="rules">${record.openQuestions.map((q) =>
      `<li><span class="rid">?</span><span>${esc(q)}</span></li>`).join("")}</ul></div>
    </details>` : ""}
  </div>
</section>
</div>
<script>
(function(){
  document.documentElement.classList.add("js");
  document.addEventListener("click", function (e) {
    var tab = e.target.closest && e.target.closest(".tab");
    if (!tab) return;
    var key = tab.getAttribute("data-target"), i;
    var tabs = document.querySelectorAll(".tab");
    for (i = 0; i < tabs.length; i++) tabs[i].setAttribute("aria-selected", "false");
    tab.setAttribute("aria-selected", "true");
    var panes = document.querySelectorAll(".body-right .pane");
    for (i = 0; i < panes.length; i++) panes[i].classList.toggle("active", panes[i].getAttribute("data-version") === key);
    var rs = document.querySelectorAll(".reason[data-version]");
    for (i = 0; i < rs.length; i++) rs[i].classList.toggle("active", rs[i].getAttribute("data-version") === key);
  });
  document.addEventListener("change", function (e) {
    if (e.target.id === "diffToggle") document.documentElement.classList.toggle("showdiff", e.target.checked);
  });
})();
</script>
`;
}
