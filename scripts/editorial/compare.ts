#!/usr/bin/env tsx
// Renders a calibration record as a side by side comparison view.
//
//   npm run editorial:compare -- --section v01-orientation
//
// Reads the durable record, resolves the immutable baseline and the current
// manuscript text for the section, and writes a disposable view under
// generated/calibration/. Read only with respect to editorial/.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  editorialCalibrationRoot,
  editorialReviewsRoot,
  editorialVolumesRoot,
  generatedCalibrationRoot,
  repoRoot,
} from "../repository/paths";

type ReasonKind = "applied" | "kept" | "cut" | "error" | "cost" | "remaining";

interface Generation {
  label: string;
  derivedFrom?: string;
  status: "rejected" | "basis" | "candidate" | "approved";
  title?: string;
  text: string[];
  reasoning?: { kind: ReasonKind; note: string }[];
}

interface CalibrationRecord {
  schemaVersion: number;
  sectionId: string;
  editorialId: string;
  sectionHeading: string;
  status: "open" | "settled" | "superseded";
  baseline: { batchId: string; path: string; sha256?: string };
  voiceCard?: { line: number; claim: string; by: Record<string, boolean | null> }[];
  rulesInForce?: { id: string; obligation: string }[];
  findings?: { id: string; summary: string }[];
  generations: Generation[];
  rulings?: { id: string; question: string; decision: string; scope: string }[];
  openQuestions?: string[];
}

function fail(message: string): never {
  process.stderr.write(`editorial:compare: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): { section: string } {
  let section = "";
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--section") section = argv[i + 1] ?? "";
  }
  if (!section) fail("missing --section <section-id>");
  return { section };
}

/** Extract one section from a Markdown source by its exact heading text. */
export function extractSection(markdown: string, heading: string): string[] {
  const lines = markdown.split("\n");
  const target = heading.trim().toLowerCase();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i]);
    if (!m) continue;
    if (m[2].trim().toLowerCase() === target) {
      start = i + 1;
      level = m[1].length;
      break;
    }
  }
  if (start < 0) return [];
  const body: string[] = [];
  for (let i = start; i < lines.length; i += 1) {
    const m = /^(#{1,6})\s+/.exec(lines[i]);
    if (m && m[1].length <= level) break;
    if (/^---+$/.test(lines[i].trim())) break;
    body.push(lines[i]);
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
const wordsOf = (t: string): string[] => t.match(/[A-Za-z0-9'’-]+/g) ?? [];
const sentencesOf = (t: string): string[] =>
  t.split(/(?<=[.:!?])\s+/).map((s) => s.trim()).filter(Boolean);

export function diffWords(a: string, b: string): string {
  const A = a.split(/(\s+)/);
  const B = b.split(/(\s+)/);
  const n = A.length;
  const m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1)
    for (let j = m - 1; j >= 0; j -= 1)
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push(esc(A[i])); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { if (A[i].trim()) out.push(`<del>${esc(A[i])}</del>`); i += 1; }
    else { out.push(B[j].trim() ? `<ins>${esc(B[j])}</ins>` : B[j]); j += 1; }
  }
  while (i < n) { if (A[i].trim()) out.push(`<del>${esc(A[i])}</del>`); i += 1; }
  while (j < m) { out.push(B[j].trim() ? `<ins>${esc(B[j])}</ins>` : B[j]); j += 1; }
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

function render(record: CalibrationRecord, baseText: string[], currentText: string[]): string {
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

  const gens: Rendered[] = record.generations.map((g) => ({
    ...g,
    key: g.label.toLowerCase().replace(/\s+/g, "-"),
    ...measure(g.text, baseWords, baseText),
  })) as Rendered[];

  // Lineage grid. A root takes a column; a child stacks directly beneath its parent.
  const byLabel = new Map(gens.map((g) => [g.label, g]));
  let nextCol = 0;
  for (const g of gens) {
    const parent = g.derivedFrom ? byLabel.get(g.derivedFrom) : undefined;
    if (parent) { g.col = parent.col; g.row = (parent.row ?? 1) + 1; }
    else { nextCol += 1; g.col = nextCol; g.row = 1; }
  }
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

  return `<title>${esc(record.sectionHeading)} &mdash; calibration</title>
<style>
:root{
--paper:#f4ead7;--paper-soft:#fbf6eb;--ink:#13202a;--ink-soft:#4f4d49;--ink-muted:#5a666c;
--bronze:#a47b3f;--bronze-deep:#77542a;--sage:#60796d;
--line:rgba(119,84,42,.24);--line-soft:rgba(119,84,42,.13);--panel:#fbf6eb;
--cut:#8c4a33;--add:rgba(164,123,63,.20);--cut-bg:rgba(140,74,51,.13);--radius:8px;
--serif:Literata,Georgia,"Iowan Old Style",serif;color-scheme:light;}
/* Single theme by intent. Papyrus is the publication's identity. */
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif);
 -webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums}
.wrap{max-width:1260px;margin:0 auto;padding:18px 22px 56px}
.micro{font-size:10.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-muted);opacity:.85}
.top{display:flex;align-items:baseline;gap:13px;flex-wrap:wrap;padding-bottom:10px;border-bottom:1px solid var(--line)}
.top h1{font-size:19px;font-weight:600;margin:0}
.top .ident{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted)}
.top .right{margin-left:auto;display:flex;align-items:center;gap:14px}
.toggle{display:inline-flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.08em;
 text-transform:uppercase;color:var(--ink-muted);cursor:pointer;user-select:none}
.toggle input{accent-color:var(--bronze-deep);margin:0}
.sheet{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius)}
.bench{display:grid;grid-template-columns:1fr 1fr;gap:13px;align-items:start;margin-top:13px}
.head-left,.head-right{display:flex;align-items:flex-end;min-height:100%}
.head-right>*{width:100%}
.body-left,.body-right{min-width:0}
@media (max-width:940px){.bench{grid-template-columns:1fr}.head-left{display:none}}
.selector{padding:9px 11px}
.tabgrid{display:grid;gap:6px}
.tab{font-family:var(--serif);font-size:13px;border:1px solid transparent;background:transparent;
 color:var(--ink-muted);cursor:pointer;padding:7px 10px;border-radius:6px;text-align:center;position:relative}
.tab:hover{color:var(--ink);border-color:var(--line-soft)}
.tab[aria-selected="true"]{background:var(--bronze-deep);border-color:var(--bronze-deep);color:var(--paper-soft)}
.tab.is-basis{box-shadow:inset 0 -2px 0 var(--bronze);color:var(--ink)}
.tab.is-basis[aria-selected="true"]{box-shadow:none}
.tab.is-rejected{text-decoration:line-through;text-decoration-thickness:1px;opacity:.5}
.tab.derived::before{content:"";position:absolute;left:50%;top:-6px;width:1px;height:6px;background:var(--bronze)}
.refrow{margin-top:8px;padding-top:8px;border-top:1px solid var(--line-soft)}
.refrow .tab{width:100%;font-style:italic;opacity:.72}
.pane-head{display:flex;align-items:baseline;gap:9px;padding:10px 16px;border-bottom:1px solid var(--line-soft);flex-wrap:wrap}
.pane-label{font-size:10.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-muted)}
.pane-title{font-size:14.5px;font-weight:600}
.metrics{margin-left:auto;font-size:11.5px;color:var(--ink-muted);white-space:nowrap}
.metrics b{color:var(--ink);font-weight:600}
.delta.neg{color:var(--cut)}.delta.pos{color:var(--sage)}
.prose{font-size:16.5px;line-height:1.66;padding:17px 20px 18px}
.prose p{margin:0 0 1em;max-width:62ch}
.prose p:last-child{margin-bottom:0}
ins{background:var(--add);text-decoration:none}
del{background:var(--cut-bg);color:var(--cut);text-decoration:line-through;text-decoration-thickness:1px}
.cadence{padding:0 20px 15px}
.cadence .micro{margin-bottom:7px}
.bars{display:flex;flex-direction:column;gap:3px}
.bar-row{display:flex;align-items:center;gap:8px}
.bar{height:6px;border-radius:3px;background:var(--bronze);opacity:.62;min-width:3px}
.bar.para-end{background:var(--ink-muted);opacity:.42}
.bar-n{font-size:10px;color:var(--ink-muted);min-width:17px}
.chip{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--ink-muted);white-space:nowrap}
.chip-basis{border-color:var(--bronze);color:var(--bronze-deep)}
.chip-candidate,.chip-approved{background:var(--bronze-deep);border-color:var(--bronze-deep);color:var(--paper-soft)}
.chip-rejected{text-decoration:line-through;opacity:.7}
.chip-warn{color:var(--cut);border-color:var(--cut)}
.foot{display:grid;grid-template-columns:1.35fr 1fr;gap:13px;margin-top:13px;align-items:start}
@media (max-width:940px){.foot{grid-template-columns:1fr}}
.block{padding:15px 18px 17px}
.block>.micro{margin-bottom:10px}
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
.diffed{display:none}
.js .pane[data-version]:not([data-pinned]){display:none}
.js .pane[data-version].active{display:block}
.js .reason[data-version]{display:none}
.js .reason[data-version].active{display:block}
.js.showdiff .prose:not(.diffed){display:none}
.js.showdiff .diffed{display:block}
.js .nojs{display:none}
.nojs{font-size:11.5px;color:var(--ink-muted);margin:10px 0 0}
</style>
<div class="wrap">
<div class="top">
  <span class="ident">${esc(record.editorialId)} &middot; ${esc(record.sectionId)} &middot; ${esc(record.status)}</span>
  <h1>${esc(record.sectionHeading)}</h1>
  <div class="right"><label class="toggle"><input type="checkbox" id="diffToggle"> Show diff</label></div>
</div>
<div class="bench">
  <div class="head-left"><span class="micro">Baseline, pinned</span></div>
  <div class="head-right"><div class="sheet selector">
    <div class="tabgrid" role="tablist" style="grid-template-columns:repeat(${Math.max(nextCol, 1)},minmax(0,1fr))">
      ${gens.map((g) => `<button class="tab is-${g.status}${g.derivedFrom ? " derived" : ""}" role="tab" aria-selected="${g.key === candidate?.key}" data-target="${g.key}" style="grid-column:${g.col};grid-row:${g.row}">${esc(g.label)}</button>`).join("")}
    </div>
    <div class="refrow"><button class="tab is-reference" role="tab" aria-selected="false" data-target="shipped">Shipped</button></div>
  </div></div>
  <div class="body-left">${pane(baseRow, true, true)}</div>
  <div class="body-right">${all.map((v) => pane(v, v.key === candidate?.key, false)).join("")}</div>
</div>
<div class="foot">
  <div class="sheet block">
    <div class="micro">Editorial reasoning</div>
    ${all.map(reason).join("")}
    <p class="nojs">Scripting is unavailable, so every variant and its reasoning are shown and diffs are hidden.</p>
  </div>
  <div class="sheet block">
    ${record.voiceCard?.length ? `<div class="micro">Voice card assertions</div><ul class="vc">${record.voiceCard.map((a) =>
      `<li><span class="lineno">L${a.line}</span><span><span class="claim">${esc(a.claim)}</span><span class="states">${gens.map((g) =>
        `<span>${tick(a.by[g.key] ?? a.by[g.label])} ${esc(g.label)}</span>`).join("")}</span></span></li>`).join("")}</ul>` : ""}
    ${record.rulesInForce?.length ? `<div class="micro" style="margin:16px 0 9px">Rules in force</div><ul class="rules">${record.rulesInForce.map((r) =>
      `<li><span class="rid">${esc(r.id)}</span><span>${esc(r.obligation)}</span></li>`).join("")}</ul>` : ""}
    <div class="micro" style="margin:16px 0 9px">Reading the selector</div>
    <ul class="legend">
      <li><span class="key key-basis"></span>a basis further variants derive from</li>
      <li><span class="key key-rejected"></span>considered and not approved</li>
      <li><span class="key key-candidate"></span>the current candidate</li>
      <li><span class="key key-descent"></span>stacked below its parent, one generation down</li>
    </ul>
    ${record.openQuestions?.length ? `<div class="micro" style="margin:16px 0 9px">Open questions</div><ul class="rules">${record.openQuestions.map((q) =>
      `<li><span class="rid">?</span><span>${esc(q)}</span></li>`).join("")}</ul>` : ""}
  </div>
</div>
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

function main(): void {
  const { section } = parseArgs(process.argv.slice(2));
  const editorialId = /^v(\d{2})-/.exec(section)?.[1];
  if (!editorialId) fail(`cannot derive an editorial id from section "${section}"`);
  const volume = `volume-${editorialId}`;

  const recordPath = path.join(editorialCalibrationRoot, volume, `${section}.json`);
  if (!existsSync(recordPath)) fail(`no calibration record at ${path.relative(repoRoot, recordPath)}`);
  const record = JSON.parse(readFileSync(recordPath, "utf8")) as CalibrationRecord;

  const baselinePath = path.join(editorialReviewsRoot, "volumes", volume, record.baseline.batchId, record.baseline.path);
  if (!existsSync(baselinePath)) fail(`baseline missing at ${path.relative(repoRoot, baselinePath)}`);
  const currentPath = path.join(editorialVolumesRoot, volume, "manuscript.md");

  const baseText = extractSection(readFileSync(baselinePath, "utf8"), record.sectionHeading);
  const currentText = extractSection(readFileSync(currentPath, "utf8"), record.sectionHeading);
  if (!baseText.length) fail(`heading "${record.sectionHeading}" not found in the baseline`);

  mkdirSync(generatedCalibrationRoot, { recursive: true });
  const out = path.join(generatedCalibrationRoot, `${section}.html`);
  writeFileSync(out, render(record, baseText, currentText));

  process.stdout.write(`${path.relative(repoRoot, out)}\n`);
  process.stdout.write(`  baseline ${baseText.flatMap(wordsOf).length} words, ${record.generations.length} generations\n`);
}

if (import.meta.filename === process.argv[1]) main();
