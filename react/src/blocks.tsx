import React from "react";
import { inlineMd, slugify, richTextHtml, chartSvg, renderBlock, knownBlockTypes, parseUnifiedDiff } from "../../src/generate.mjs";

// React-side plugin registry, register a component for a custom block type so it renders
// natively in the React port (parity with the Node generator's registerBlock).
const componentRegistry = new Map<string, React.FC<{ b: any }>>();
export function registerComponent(type: string, Component: React.FC<{ b: any }>) {
  componentRegistry.set(type, Component);
}
import type { Block as B, PatchItem as PatchItemModel, ProcessItem as ProcessItemModel, ReviewCandidate } from "./types.js";

// Render context (glossary + baseUrl) for inline-markdown resolution. Set once per render.
let CTX: any = { glossary: new Map<string, string>(), baseUrl: "" };
export function setCtx(ctx: any) {
  CTX = ctx;
}
const md = (t?: string) => ({ __html: inlineMd(t ?? "", CTX) });
const raw = (h?: string) => ({ __html: h ?? "" });
const rich = (t?: string) => ({ __html: richTextHtml(t ?? "", CTX) });
const PROCESS_VERDICTS = ["undecided", "approve", "revise", "skip", "defer", "split", "retry", "block"];
const REVIEW_VERDICTS = ["undecided", "approve", "revise", "skip", "defer", "block"];
const rowCode = (i: number) => `ITEM-${String(i + 1).padStart(3, "0")}`;
const rowDomId = (blockId: string | undefined, itemId: string | undefined) => slugify(`${blockId || "block"}-${itemId || "item"}`);
const detailRows = (rows: Array<[string, any]>): [string, string][] =>
  rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim()).map(([k, v]) => [k, String(v)]);
const asArray = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
const safeUrl = (u?: string) => {
  const s = String(u || "").trim();
  return /^(javascript|data|vbscript):/i.test(s.replace(/[\s\x00-\x1f]+/g, "")) ? "#" : s;
};

const CopyIcon = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const ChevronIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const Wrap: React.FC<{ type: string; id?: string; children: React.ReactNode }> = ({ type, id, children }) => (
  <section className="ds-block" data-block={type} data-id={id}>
    <button className="ds-copy" type="button" data-copy aria-label="Copy block" title="Copy">{CopyIcon}</button>
    {children}
  </section>
);

const Hero: React.FC<{ b: B }> = ({ b }) => (
  <section className="ds-hero ds-block" data-block="hero" data-id={b.id}>
    {b.eyebrow && <p className="ds-eyebrow">{b.eyebrow}</p>}
    <h1 id={b.id} data-edit={`${b.id}:title`}>{b.title}</h1>
    {b.lede && <p className="ds-lede" data-edit={`${b.id}:lede`} dangerouslySetInnerHTML={md(b.lede)} />}
    {b.pills?.length > 0 && (
      <div className="ds-pillrow">
        {b.pills.map((p: string, i: number) => <span className="ds-pill" key={i}>{p}</span>)}
      </div>
    )}
    {b.sideCards?.length > 0 && (
      <div className="ds-meta">
        {b.sideCards.map((c: any, i: number) => (
          <div className="ds-meta-item" key={i}>
            <span className="ds-label">{c.label}</span>
            <span className="ds-val">{c.value}</span>
          </div>
        ))}
      </div>
    )}
  </section>
);

const Section: React.FC<{ b: B }> = ({ b }) => (
  <section className={`${b.framed === false ? "ds-section unframed" : "ds-section"} ds-block`} data-block="section" data-id={b.id} {...(b.collapsed ? { "data-collapsed": "1" } : {})}>
    <div className="ds-section-head">
      <div className="ds-section-titles">
        <h2 id={b.id} data-edit={`${b.id}:title`}>{b.title}</h2>
        {b.subtitle && <p className="ds-muted" data-edit={`${b.id}:subtitle`} dangerouslySetInnerHTML={md(b.subtitle)} />}
      </div>
      <button className="ds-toggle" type="button" data-toggle aria-label="Toggle section">{ChevronIcon}</button>
    </div>
    <div className="ds-section-body">
      {(b.blocks || []).map((c: B, i: number) => <Block b={c} key={c.id || i} />)}
    </div>
  </section>
);

const Heading: React.FC<{ id?: string; text?: string }> = ({ id, text }) => (text ? <h3 id={id}>{text}</h3> : null);

const TwoCol: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="two-col" id={b.id}>
    <div className="ds-twocol">
      <div>{(b.left || []).map((c: B, i: number) => <Block b={c} key={c.id || i} />)}</div>
      <div>{(b.right || []).map((c: B, i: number) => <Block b={c} key={c.id || i} />)}</div>
    </div>
  </Wrap>
);

const SummaryCards: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="summary-cards" id={b.id}>
    <div className="ds-cardgrid">
      {(b.cards || []).map((c: any, i: number) => (
        <article className={`ds-card${c.tone ? " tone-" + c.tone : ""}`} key={i}>
          <h3>{c.title}</h3>
          <p dangerouslySetInnerHTML={md(c.body)} />
        </article>
      ))}
    </div>
  </Wrap>
);

const StatStrip: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="stat-strip" id={b.id}>
    <div className="ds-statgrid">
      {(b.stats || []).map((s: any, i: number) => {
        const deltaValue = typeof s.delta === "object" ? s.delta.value || s.delta.label || "" : s.delta;
        const deltaLabel = typeof s.delta === "object" && s.delta.label && s.delta.label !== deltaValue ? s.delta.label : "";
        return (
          <div className="ds-stat" key={i}>
            <strong>{s.value}</strong>
            <span>{s.label}</span>
            {deltaValue && (
              <small className={`ds-stat-delta${typeof s.delta === "object" && s.delta.tone ? " tone-" + slugify(s.delta.tone) : ""}`}>
                <span dangerouslySetInnerHTML={md(deltaValue)} />
                {deltaLabel && <> <span dangerouslySetInnerHTML={md(deltaLabel)} /></>}
              </small>
            )}
          </div>
        );
      })}
    </div>
  </Wrap>
);

const Flow: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="flow" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <div className="ds-flow">
      {(b.steps || []).map((s: any, i: number) => (
        <div className="ds-flowstep" key={i}>
          <div className="ds-flowstep-body"><strong>{s.title}</strong><span dangerouslySetInnerHTML={md(s.body)} /></div>
        </div>
      ))}
    </div>
  </Wrap>
);

const Timeline: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="timeline" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <div className="ds-timeline">
      {(b.phases || []).map((p: any, i: number) => (
        <div className="ds-phase" key={i}>
          <div className="ds-phase-id">
            {p.label}
            {p.status && <span className={`ds-status s-${p.status}`}>{p.status}</span>}
            {p.date && <span className="ds-date">{p.date}</span>}
          </div>
          <div dangerouslySetInnerHTML={md(p.body)} />
        </div>
      ))}
    </div>
  </Wrap>
);

const Table: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="table" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <div className="ds-tablewrap">
      <table>
        <thead><tr>{(b.columns || []).map((c: string, i: number) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {(b.rows || []).map((r: string[], i: number) => (
            <tr key={i}>{(Array.isArray(r) ? r : []).map((c: string, j: number) => <td key={j} dangerouslySetInnerHTML={md(c)} />)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  </Wrap>
);

const Callout: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="callout" id={b.id}>
    <div className={`ds-callout tone-${b.tone || "info"}`}>
      {b.title && <strong data-edit={`${b.id}:title`}>{b.title} </strong>}
      <span data-edit={`${b.id}:body`} dangerouslySetInnerHTML={md(b.body)} />
    </div>
  </Wrap>
);

const Code: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="code" id={b.id}>
    <div className="ds-code">
      <div className="ds-code-bar">
        <span className="ds-lang">{b.filename || b.lang || "code"}</span>
        <button className="ds-code-copy" type="button" data-code-copy>Copy</button>
      </div>
      {b._hl ? <div dangerouslySetInnerHTML={raw(b._hl)} /> : <pre><code>{b.code}</code></pre>}
    </div>
  </Wrap>
);

const CodeEditor: React.FC<{ b: B }> = ({ b }) => {
  const id = b.id || slugify(b.title || b.filename || b.targetPath || "code-editor");
  const code = String(b.code || "");
  const rows = globalThis.Math.min(28, globalThis.Math.max(10, code.split(/\r?\n/).length + 1));
  const meta: string[] = [];
  if (b.lang) meta.push(b.lang);
  if (b.targetPath) meta.push(b.targetPath);
  if (b.workItems?.length) meta.push(`Work · ${b.workItems.join(", ")}`);
  return (
    <Wrap type="code-editor" id={id}>
      {b.title && <h3 id={id}>{b.title}</h3>}
      {b.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(b.summary)} />}
      <div className="ds-codeedit" data-editor-shell={id}>
        <div className="ds-codeedit-bar">
          <span className="ds-lang">{b.filename || b.targetPath || b.lang || "code"}</span>
          <div className="ds-codeedit-meta">{meta.map((x, i) => <span key={i}>{x}</span>)}</div>
        </div>
        <textarea
          className="ds-codeedit-area"
          data-code-editor={id}
          data-editor-lang={b.lang || ""}
          data-editor-filename={b.filename || ""}
          data-editor-target={b.targetPath || ""}
          spellCheck={false}
          readOnly={!!b.readonly}
          rows={rows}
          defaultValue={code}
        />
        <div className="ds-codeedit-actions">
          <span className="ds-codeedit-state" data-editor-state={id}>clean</span>
          <button className="ds-btn ds-btn-line" type="button" data-editor-reset={id}>Reset</button>
          <button className="ds-btn ds-btn-line" type="button" data-export-editors>Export edits packet</button>
          <button className="ds-btn ds-btn-line" type="button" data-import-editors>Import</button>
        </div>
      </div>
    </Wrap>
  );
};

const diffFileLabel = (file: any) => (file.newPath && file.newPath !== "/dev/null" ? file.newPath : file.oldPath || "diff");

const DiffViewInner: React.FC<{ b: B; nested?: boolean }> = ({ b, nested = false }) => {
  const files = parseUnifiedDiff(b.diff || "", b.filename || b.title || "diff");
  const additions = files.reduce((sum: number, file: any) => sum + file.additions, 0);
  const deletions = files.reduce((sum: number, file: any) => sum + file.deletions, 0);
  return (
    <section className={nested ? "ds-diffview nested" : "ds-block ds-diffview"} data-block="diff-view" data-id={b.id}>
      {!nested && <button className="ds-copy" type="button" data-copy aria-label="Copy block" title="Copy">{CopyIcon}</button>}
      {b.title && (nested ? <h4>{b.title}</h4> : <h3 id={b.id}>{b.title}</h3>)}
      {b.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(b.summary)} />}
      <div className="ds-diff-summary"><span>{files.length} file{files.length === 1 ? "" : "s"}</span><span className="add">+{additions}</span><span className="del">-{deletions}</span></div>
      {files.length > 0 && (
        <nav className="ds-diff-files">
          {files.map((file: any, i: number) => {
            const label = diffFileLabel(file);
            return <a href={`#${b.id}-${slugify(label)}`} className="ds-diff-filelink" key={i}><span>{label}</span><b>+{file.additions} -{file.deletions}</b></a>;
          })}
        </nav>
      )}
      <div className="ds-diff-body">
        {files.length > 0 ? files.map((file: any, i: number) => {
          const label = diffFileLabel(file);
          const fileKey = `${b.id}:${label}`;
          return (
            <details className="ds-diff-file" id={`${b.id}-${slugify(label)}`} data-diff-file={fileKey} open key={i}>
              <summary><span className="ds-diff-path">{label}</span><span className="ds-diff-stat">+{file.additions} -{file.deletions}</span></summary>
              <div className="ds-diff-review">
                <label><span>File verdict</span><select data-diff-file-verdict={fileKey}>{REVIEW_VERDICTS.map((v) => <option value={v} key={v}>{v}</option>)}</select></label>
                <label><span>File comment</span><textarea data-diff-file-comment={fileKey} placeholder="File-level review note" /></label>
              </div>
              {file.meta.length > 0 && <div className="ds-diff-meta-lines">{file.meta.map((line: string, j: number) => <code key={j}>{line}</code>)}</div>}
              {file.hunks.map((hk: any, h: number) => (
                <div className="ds-hunk" data-diff-hunk={`${fileKey}:h${h + 1}`} key={h}>
                  <div className="ds-hunk-head">
                    <span>{hk.header}</span>
                    <label><span>Hunk verdict</span><select data-diff-hunk-verdict={`${fileKey}:h${h + 1}`}>{REVIEW_VERDICTS.map((v) => <option value={v} key={v}>{v}</option>)}</select></label>
                  </div>
                  <textarea className="ds-diff-comment" data-diff-hunk-comment={`${fileKey}:h${h + 1}`} placeholder="Hunk comment or requested change" />
                  <pre className="ds-diff-lines"><code>{hk.lines.map((line: any, j: number) => (
                      <span className={`ds-diff-line ${line.type}`} key={j}>
                        <span className="ds-diff-num">{line.oldNumber}</span>
                        <span className="ds-diff-num">{line.newNumber}</span>
                        <span className="ds-diff-mark">{line.mark}</span>
                        <span className="ds-diff-code">{line.text}</span>
                      </span>
                    ))}</code></pre>
                </div>
              ))}
            </details>
          );
        }) : <pre className="ds-diff-empty"><code>{b.diff || ""}</code></pre>}
      </div>
      <div className="ds-codeedit-actions">
        <button className="ds-btn ds-btn-line" type="button" data-export-diff-review>Export diff review packet</button>
        <button className="ds-btn ds-btn-line" type="button" data-import-diff-review>Import</button>
      </div>
    </section>
  );
};

const PatchSet: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="patch-set" id={b.id}>
    {b.title && <h3 id={b.id}>{b.title}</h3>}
    {b.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(b.summary)} />}
    <div className="ds-patchlist">
      {(b.patches || []).map((p: PatchItemModel, i: number) => {
        const chips: string[] = [];
        if (p.operation) chips.push(p.operation);
        if (p.status) chips.push(p.status);
        if (p.risk) chips.push(`Risk · ${p.risk}`);
        const patchId = p.id || slugify(p.title || "patch");
        const reviewVerdict = REVIEW_VERDICTS.includes((p as any).review || "") ? (p as any).review : "undecided";
        const rows: [string, string][] = [];
        if (p.files?.length) rows.push(["Files", p.files.join(", ")]);
        if (p.workItems?.length) rows.push(["Work items", p.workItems.join(", ")]);
        if (p.verification?.length) rows.push(["Verification", p.verification.join(", ")]);
        Object.entries(p.details || {}).forEach(([k, v]) => rows.push([k, v]));
        return (
          <article className="ds-patch" data-patch={patchId} key={patchId || i}>
            <div className="ds-patch-head">
              <div><h4>{p.title || p.id || "Patch"}</h4>{p.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(p.summary)} />}</div>
              {chips.length > 0 && <div className="ds-chips">{chips.map((x, j) => <span className="ds-chip" key={j}>{x}</span>)}</div>}
            </div>
            <div className="ds-patch-review">
              <label><span>Patch verdict</span><select data-patch-verdict={patchId} defaultValue={reviewVerdict}>{REVIEW_VERDICTS.map((v) => <option value={v} key={v}>{v}</option>)}</select></label>
              <label><span>Review notes</span><textarea data-patch-notes={patchId} placeholder="Apply, revise, skip, or follow-up notes" defaultValue={(p as any).notes || ""} /></label>
            </div>
            {rows.length > 0 && (
              <dl className="ds-detailgrid">
                {rows.map(([k, v], j) => <div className="ds-detail" key={j}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>)}
              </dl>
            )}
            {p.diff && <DiffViewInner b={{ type: "diff-view", id: `${patchId}-diff`, title: "Diff", diff: p.diff }} nested />}
          </article>
        );
      })}
    </div>
    <div className="ds-codeedit-actions">
      <button className="ds-btn ds-btn-line" type="button" data-export-patch-review>Export patch review packet</button>
      <button className="ds-btn ds-btn-line" type="button" data-import-patch-review>Import</button>
    </div>
  </Wrap>
);

const DiffView: React.FC<{ b: B }> = ({ b }) => <DiffViewInner b={b} />;

const Tabs: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="tabs" id={b.id}>
    <div className="ds-tabs">
      <div className="ds-tabbar">
        {(b.tabs || []).map((t: any, i: number) => (
          <button className={`ds-tab${i === 0 ? " active" : ""}`} type="button" data-tab={i} key={i}>{t.label}</button>
        ))}
      </div>
      {(b.tabs || []).map((t: any, i: number) => (
        <div className={`ds-pane${i === 0 ? " active" : ""}`} data-pane={i} key={i}>
          {(t.blocks || []).map((c: B, j: number) => <Block b={c} key={c.id || j} />)}
        </div>
      ))}
    </div>
  </Wrap>
);

const Faq: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="faq" id={b.id}>
    <Heading id={b.id} text={b.title} />
    {(b.items || []).map((it: any, i: number) => (
      <details className="ds-faq" key={i}>
        <summary>{it.q}</summary>
        <p dangerouslySetInnerHTML={md(it.a)} />
      </details>
    ))}
  </Wrap>
);

const References: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="references" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <div className="ds-tablewrap">
      <table>
        <thead><tr><th>Source</th><th>Signal</th><th>Use</th></tr></thead>
        <tbody>
          {(b.items || []).map((r: any, i: number) => (
            <tr key={i}>
              <td>{r.url ? <a href={safeUrl(r.url)}>{r.label}</a> : r.label}</td>
              <td dangerouslySetInnerHTML={md(r.signal)} />
              <td dangerouslySetInnerHTML={md(r.use)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Wrap>
);

const DecisionMatrix: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="decision-matrix" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <div className="ds-tablewrap">
      <table>
        <thead><tr><th>Option</th>{(b.criteria || []).map((c: string, i: number) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {(b.options || []).map((o: any, i: number) => (
            <tr className={o.recommended ? "ds-rec" : ""} key={i}>
              <td><strong>{o.name}</strong>{o.recommended && <span className="ds-pill"> recommended</span>}</td>
              {(o.scores || []).map((s: string, j: number) => <td key={j} dangerouslySetInnerHTML={md(s)} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Wrap>
);

const RiskRegister: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="risk-register" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <div className="ds-tablewrap">
      <table>
        <thead><tr><th>Risk</th><th>Likelihood</th><th>Impact</th><th>Mitigation</th></tr></thead>
        <tbody>
          {(b.risks || []).map((r: any, i: number) => (
            <tr key={i}>
              <td dangerouslySetInnerHTML={md(r.risk)} />
              <td><span className={`ds-lvl l-${r.likelihood || ""}`}>{r.likelihood}</span></td>
              <td><span className={`ds-lvl l-${r.impact || ""}`}>{r.impact}</span></td>
              <td dangerouslySetInnerHTML={md(r.mitigation)} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </Wrap>
);

const ActionItems: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="action-items" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <ul className="ds-actions">
      {(b.items || []).map((it: any, i: number) => (
        <li className="ds-action" data-action={`${b.id}:${i}`} key={i}>
          <label><input type="checkbox" data-action-check defaultChecked={it.status === "done"} /><span className="ds-action-title" dangerouslySetInnerHTML={md(it.title)} /></label>
          <span className="ds-action-meta">
            {it.owner && <span className="ds-owner">{it.owner}</span>}
            <span className={`ds-status s-${it.status || "todo"}`}>{it.status || "todo"}</span>
          </span>
        </li>
      ))}
    </ul>
  </Wrap>
);

const Assumptions: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="assumptions" id={b.id}>
    <h3 id={b.id}>{b.title || "Assumptions & open questions"}</h3>
    <ul className="ds-assumptions">
      {(b.items || []).map((it: any, i: number) => (
        <li className={`ds-assumption a-${it.status || "unverified"}`} key={i}>
          <span className="ds-akind">{it.kind || "assumption"}</span>
          <span dangerouslySetInnerHTML={md(it.statement)} />
          <span className="ds-astatus">{it.status || "unverified"}</span>
        </li>
      ))}
    </ul>
  </Wrap>
);

const Glossary: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="glossary" id={b.id}>
    <h3 id={b.id}>{b.title || "Glossary"}</h3>
    <dl className="ds-glossary">
      {(b.terms || []).map((t: any, i: number) => (
        <div className="ds-gterm" id={`term-${slugify(t.term)}`} key={i}>
          <dt>{t.term}</dt><dd dangerouslySetInnerHTML={md(t.definition)} />
        </div>
      ))}
    </dl>
  </Wrap>
);

const Diagram: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="diagram" id={b.id}>
    <Heading id={b.id} text={b.title} />
    {b._svg ? (
      <div className="ds-diagram ds-diagram-svg" dangerouslySetInnerHTML={raw(b._svg)} />
    ) : (
      <div className="ds-diagram">
        <div className="ds-code-bar"><span>diagram · {b.format || "dot"}</span></div>
        <pre><code>{b.spec}</code></pre>
      </div>
    )}
  </Wrap>
);

const ReviewItem: React.FC<{ c: ReviewCandidate; blockId?: string; index: number }> = ({ c, blockId, index }) => {
  const itemId = c.id || rowCode(index).toLowerCase();
  const domId = rowDomId(blockId, itemId);
  const chips: string[] = [];
  if (c.category) chips.push(c.category);
  if (c.impact) chips.push(`Impact · ${c.impact}`);
  if (c.effort) chips.push(`Effort · ${c.effort}`);
  (c.badges || []).forEach((x) => chips.push(x));
  const searchText = [c.title, c.summary, c.category, c.body].filter(Boolean).join(" ").toLowerCase();
  const hasRef = !!(c.body || (c.blocks && c.blocks.length) || (c.details && Object.keys(c.details).length));
  return (
    <article id={domId} className="ds-ritem" data-candidate={itemId} {...(c.scope ? { "data-scope": c.scope } : {})} data-text={searchText}>
      <div className="ds-ritem-head" data-rtoggle>
        <span className="ds-ritem-check" data-stop><input type="checkbox" data-select={itemId} aria-label={`Select ${c.title}`} /></span>
        <div className="ds-ritem-titles">
          <a className="ds-row-anchor" href={`#${domId}`}>{rowCode(index)}</a>
          <h4>{c.title}</h4>
          <p className="ds-muted" dangerouslySetInnerHTML={md(c.summary)} />
          {chips.length > 0 && <div className="ds-chips">{chips.map((x, i) => <span className="ds-chip" key={i}>{x}</span>)}</div>}
        </div>
        <div className="ds-ritem-aside">
          {c.status && <span className={`ds-status s-${slugify(c.status)}`}>{c.status}</span>}
          <span className="ds-chev" aria-hidden="true">▾</span>
        </div>
      </div>
      <div className="ds-ritem-wrap">
        <div className="ds-ritem-body">
          {hasRef && (
            <div className="ds-ref">
              {c.body && <div className="ds-prose" dangerouslySetInnerHTML={rich(c.body)} />}
              {(c.blocks || []).map((x, i) => <Block b={x} key={x.id || i} />)}
              {c.details && Object.keys(c.details).length > 0 && (
                <dl className="ds-detailgrid">
                  {Object.entries(c.details).map(([k, v], i) => (
                    <div className="ds-detail" key={i}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>
                  ))}
                </dl>
              )}
            </div>
          )}
          <label className="ds-notes"><span>Notes</span><textarea data-notes={itemId} placeholder="Decision notes, priority, constraints" /></label>
        </div>
      </div>
    </article>
  );
};

const ReviewBoard: React.FC<{ b: B }> = ({ b }) => (
  <section className="ds-block ds-reviewboard" data-block="review-board" data-id={b.id}>
    {b.title && <h2 id={b.id}>{b.title}</h2>}
    <div className="ds-review-bar">
      <input className="ds-review-search" type="search" placeholder="Filter…" data-review-search aria-label="Filter items" />
      <label className="ds-review-only"><input type="checkbox" data-review-only /> Selected only</label>
      <button className="ds-btn ds-btn-line" type="button" data-review-expand>Expand all</button>
      <span className="ds-review-count" data-review-count>0 selected</span>
      <button className="ds-btn ds-btn-line" type="button" data-export-decisions>Export decisions packet</button>
      <button className="ds-btn ds-btn-line" type="button" data-import-decisions>Import</button>
    </div>
    <div className="ds-rlist">
      {(b.candidates || []).map((c: ReviewCandidate, i: number) => <ReviewItem c={c} blockId={b.id} index={i} key={c.id || i} />)}
    </div>
  </section>
);

const ProcessItem: React.FC<{ item: ProcessItemModel; blockId?: string; index: number }> = ({ item, blockId, index }) => {
  const itemId = item.id || rowCode(index).toLowerCase();
  const domId = rowDomId(blockId, itemId);
  const chips: string[] = [];
  if (item.category) chips.push(item.category);
  if (item.priority) chips.push(`Priority · ${item.priority}`);
  if (item.owner) chips.push(`Owner · ${item.owner}`);
  if (item.impact) chips.push(`Impact · ${item.impact}`);
  if (item.effort) chips.push(`Effort · ${item.effort}`);
  (item.badges || []).forEach((x) => chips.push(x));
  const rows: [string, string][] = [];
  if (item.files?.length) rows.push(["Files", item.files.join(", ")]);
  if (item.dependencies?.length) rows.push(["Depends on", item.dependencies.join(", ")]);
  if (item.verification?.length) rows.push(["Verification", item.verification.join(", ")]);
  if (item.risks?.length) rows.push(["Risks", item.risks.join(", ")]);
  if (item.evidence?.length) rows.push(["Evidence", item.evidence.join(", ")]);
  Object.entries(item.details || {}).forEach(([k, v]) => rows.push([k, v]));
  const verdict = PROCESS_VERDICTS.includes(item.verdict || "") ? item.verdict || "undecided" : "undecided";
  const searchText = [item.title, item.summary, item.category, item.owner, item.body, ...(item.files || []), ...(item.verification || [])].filter(Boolean).join(" ").toLowerCase();
  const hasRef = !!(item.body || (item.blocks && item.blocks.length) || rows.length);
  return (
    <article id={domId} className={`ds-ritem ds-pitem verdict-${verdict}`} data-process-item={itemId} data-text={searchText}>
      <div className="ds-ritem-head" data-ptoggle>
        <div className="ds-ritem-titles">
          <a className="ds-row-anchor" href={`#${domId}`}>{rowCode(index)}</a>
          <h4>{item.title}</h4>
          {item.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(item.summary)} />}
          {chips.length > 0 && <div className="ds-chips">{chips.map((x, i) => <span className="ds-chip" key={i}>{x}</span>)}</div>}
        </div>
        <div className="ds-ritem-aside">
          {item.status && <span className={`ds-status s-${slugify(item.status)}`}>{item.status}</span>}
          <label className="ds-process-verdict-wrap" data-stop>
            <span>Verdict</span>
            <select className="ds-process-verdict" data-process-verdict={itemId} defaultValue={verdict}>
              {PROCESS_VERDICTS.map((v) => <option value={v} key={v}>{v}</option>)}
            </select>
          </label>
          <span className="ds-chev" aria-hidden="true">▾</span>
        </div>
      </div>
      <div className="ds-ritem-wrap">
        <div className="ds-ritem-body">
          {hasRef && (
            <div className="ds-ref">
              {item.body && <div className="ds-prose" dangerouslySetInnerHTML={rich(item.body)} />}
              {(item.blocks || []).map((x, i) => <Block b={x} key={x.id || i} />)}
              {rows.length > 0 && (
                <dl className="ds-detailgrid">
                  {rows.map(([k, v], i) => (
                    <div className="ds-detail" key={i}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>
                  ))}
                </dl>
              )}
            </div>
          )}
          <label className="ds-notes"><span>Notes</span><textarea data-process-notes={itemId} placeholder="Verdict notes, constraints, follow-up instructions" defaultValue={(item as any).notes || ""} /></label>
        </div>
      </div>
    </article>
  );
};

const ProcessBoard: React.FC<{ b: B }> = ({ b }) => (
  <section className="ds-block ds-reviewboard ds-processboard" data-block="process-board" data-id={b.id}>
    {b.title && <h2 id={b.id}>{b.title}</h2>}
    <div className="ds-review-bar">
      <input className="ds-review-search" type="search" placeholder="Filter…" data-process-search aria-label="Filter process items" />
      <label className="ds-review-only"><input type="checkbox" data-process-only /> With verdict only</label>
      <button className="ds-btn ds-btn-line" type="button" data-process-expand>Expand all</button>
      <span className="ds-review-count" data-process-count>0 verdicts</span>
      <button className="ds-btn ds-btn-line" type="button" data-export-process>Export process packet</button>
      <button className="ds-btn ds-btn-line" type="button" data-import-process>Import</button>
    </div>
    <div className="ds-rlist">
      {(b.items || []).map((item: ProcessItemModel, i: number) => <ProcessItem item={item} blockId={b.id} index={i} key={item.id || i} />)}
    </div>
  </section>
);

const SimpleProcessList: React.FC<{ items?: any[]; cls: string }> = ({ items = [], cls }) => (
  <div className="ds-process-list">
    {items.map((it: any, i: number) => {
      const chips: string[] = [];
      ["status", "severity", "kind", "trust", "owner", "producer", "consumer"].forEach((k) => { if (it[k]) chips.push(`${k} · ${it[k]}`); });
      const title = it.title || it.label || it.id || "Item";
      const body = it.body || it.summary || it.response || it.rationale || it.notes || "";
      const rows: [string, string][] = [];
      ["source", "created", "command", "expected", "actual", "decision", "recommendation", "request", "nextStep"].forEach((k) => {
        if (it[k]) rows.push([k.replace(/[A-Z]/g, (m: string) => " " + m.toLowerCase()), it[k]]);
      });
      if (it.files?.length) rows.push(["files", it.files.join(", ")]);
      if (it.artifacts?.length) rows.push(["artifacts", it.artifacts.join(", ")]);
      if (it.links?.length) rows.push(["links", it.links.join(", ")]);
      return (
        <article className={`ds-process-card ${cls}`} key={it.id || i}>
          <div className="ds-process-card-head">
            <div><h4>{title}</h4>{body && <p className="ds-muted" dangerouslySetInnerHTML={md(body)} />}</div>
            {chips.length > 0 && <div className="ds-chips">{chips.map((x, j) => <span className="ds-chip" key={j}>{x}</span>)}</div>}
          </div>
          {rows.length > 0 && (
            <dl className="ds-detailgrid">
              {rows.map(([k, v], j) => <div className="ds-detail" key={j}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>)}
            </dl>
          )}
        </article>
      );
    })}
  </div>
);

const VerificationRun: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="verification-run" id={b.id}>
    <Heading id={b.id} text={b.title} />
    {b.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(b.summary)} />}
    <SimpleProcessList items={(b.runs || []).map((r: any) => ({ ...r, body: r.notes || r.summary, kind: r.status }))} cls="ds-vrun" />
  </Wrap>
);

const EvidenceLog: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="evidence-log" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <SimpleProcessList items={b.items || []} cls="ds-evidence" />
  </Wrap>
);

const TrustReport: React.FC<{ b: B }> = ({ b }) => {
  const sources = asArray(b.sources);
  const claims = asArray(b.claims);
  const sourceMap = new Map<string, any>(sources.filter((s: any) => s?.id).map((s: any) => [s.id, s]));
  return (
    <Wrap type="trust-report" id={b.id}>
      <Heading id={b.id} text={b.title} />
      {b.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(b.summary)} />}
      {sources.length > 0 && (
        <div className="ds-trust-sources">
          <h4>Sources</h4>
          <div className="ds-tablewrap">
            <table>
              <thead><tr><th>Source</th><th>Kind</th><th>Trust</th><th>License</th><th>Summary</th></tr></thead>
              <tbody>
                {sources.map((s: any, i: number) => {
                  const id = s.id || slugify(s.label || s.url || "source");
                  return (
                    <tr id={`${b.id}-${id}`} data-trust-source={id} key={id || i}>
                      <td>{s.url ? <a href={safeUrl(s.url)}>{s.label || s.url}</a> : (s.label || id)}</td>
                      <td dangerouslySetInnerHTML={md(s.kind || "")} />
                      <td dangerouslySetInnerHTML={md(s.trust || "")} />
                      <td dangerouslySetInnerHTML={md(s.license || "")} />
                      <td dangerouslySetInnerHTML={md(s.summary || "")} />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="ds-process-list ds-trust-claims">
        {claims.map((c: any, i: number) => {
          const id = c.id || slugify(c.claim || c.title || "claim");
          const chips = [
            c.status && `status · ${c.status}`,
            c.confidence && `confidence · ${c.confidence}`,
            c.owner && `owner · ${c.owner}`,
          ].filter(Boolean) as string[];
          const rows = detailRows([["notes", c.notes], ["updated", c.updated]]);
          return (
            <article className={`ds-process-card ds-trust-claim status-${slugify(c.status || "unverified")}`} data-trust-claim={id} key={id || i}>
              <div className="ds-process-card-head">
                <div><h4>{c.claim || c.title || id}</h4>{c.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(c.summary)} />}</div>
                {chips.length > 0 && <div className="ds-chips">{chips.map((x, j) => <span className="ds-chip" key={j}>{x}</span>)}</div>}
              </div>
              {rows.length > 0 && <dl className="ds-detailgrid">{rows.map(([k, v], j) => <div className="ds-detail" key={j}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>)}</dl>}
              {(asArray(c.sources).length > 0 || asArray(c.evidence).length > 0) && (
                <div className="ds-trust-refs">
                  {asArray(c.sources).map((sid: string) => {
                    const src = sourceMap.get(sid);
                    return src ? <a className="ds-chip ds-trust-link" href={`#${b.id}-${src.id}`} key={sid}>{src.label || src.id}</a> : <span className="ds-chip ds-trust-missing" key={sid}>missing · {sid}</span>;
                  })}
                  {asArray(c.evidence).map((e: string) => <span className="ds-chip" key={e}>{e}</span>)}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </Wrap>
  );
};

const VerdictGate: React.FC<{ b: B }> = ({ b }) => {
  const id = b.gateId || b.id || slugify(b.title || "verdict-gate");
  const options = b.options || PROCESS_VERDICTS;
  return (
    <Wrap type="verdict-gate" id={b.id}>
      <Heading id={b.id} text={b.title} />
      {b.prompt && <p className="ds-muted" dangerouslySetInnerHTML={md(b.prompt)} />}
      <div className="ds-gate" data-gate={id}>
        <label className="ds-process-verdict-wrap"><span>Verdict</span><select className="ds-process-verdict" data-verdict-gate={id} data-verdict-title={b.title || id} defaultValue={b.verdict || "undecided"}>{options.map((v: string) => <option value={v} key={v}>{v}</option>)}</select></label>
        <label className="ds-notes"><span>Notes</span><textarea data-verdict-notes={id} placeholder="Decision rationale, constraints, follow-up" /></label>
        <div className="ds-codeedit-actions"><button className="ds-btn ds-btn-line" type="button" data-export-verdicts>Export verdicts packet</button><button className="ds-btn ds-btn-line" type="button" data-import-verdicts>Import</button></div>
      </div>
    </Wrap>
  );
};

const ProcessReceipt: React.FC<{ b: B }> = ({ b }) => {
  const rows = detailRows([
    ["outcome", b.outcome],
    ["owner", b.owner],
    ["date", b.date],
    ["model", b.model],
    ["changed files", b.changedFiles?.join(", ")],
    ["commands", b.commands?.join(", ")],
    ["risks", b.risks?.join(", ")],
    ["follow ups", b.followUps?.join(", ")],
  ]);
  return (
    <Wrap type="process-receipt" id={b.id}>
      <aside className="ds-receipt ds-process-receipt">
        <div className="ds-receipt-head">{b.title || "Process receipt"}</div>
        {b.summary && <p dangerouslySetInnerHTML={md(b.summary)} />}
        {rows.length > 0 && <dl className="ds-detailgrid">{rows.map(([k, v], i) => <div className="ds-detail" key={i}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>)}</dl>}
      </aside>
    </Wrap>
  );
};

const FindingList: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="finding-list" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <SimpleProcessList items={b.findings || []} cls="ds-finding" />
  </Wrap>
);

const CommentThread: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="comment-thread" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <div className="ds-process-list">
      {(b.threads || []).map((t: any, i: number) => (
        <article className="ds-process-card" key={t.id || i}>
          <div className="ds-process-card-head"><div><h4>{t.subject || t.id || "Thread"}</h4>{t.status && <p className="ds-muted">{t.status}</p>}</div></div>
          <ul className="ds-comments">{(t.comments || []).map((c: any, j: number) => <li key={j}><strong>{c.author || "comment"}</strong>{c.created && <span className="ds-muted"> {c.created}</span>}<p dangerouslySetInnerHTML={md(c.body || "")} /></li>)}</ul>
        </article>
      ))}
    </div>
  </Wrap>
);

const CycleBoard: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="cycle-board" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <SimpleProcessList items={b.cycles || []} cls="ds-cycle" />
  </Wrap>
);

const IntegrationReport: React.FC<{ b: B }> = ({ b }) => {
  const rows = detailRows([["producer", b.producer], ["consumer", b.consumer], ["status", b.status], ["version", b.version], ["next step", b.nextStep]]);
  return (
    <Wrap type="integration-report" id={b.id}>
      <Heading id={b.id} text={b.title} />
      {b.summary && <p className="ds-muted" dangerouslySetInnerHTML={md(b.summary)} />}
      {rows.length > 0 && <dl className="ds-detailgrid">{rows.map(([k, v], i) => <div className="ds-detail" key={i}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>)}</dl>}
      <SimpleProcessList items={b.items || []} cls="ds-integration" />
    </Wrap>
  );
};

const UpstreamResponse: React.FC<{ b: B }> = ({ b }) => {
  const rows = detailRows([["upstream", b.upstream], ["status", b.status], ["url", b.url], ["request", b.request], ["response", b.response], ["next step", b.nextStep]]);
  return (
    <Wrap type="upstream-response" id={b.id}>
      <Heading id={b.id} text={b.title} />
      {rows.length > 0 && <dl className="ds-detailgrid">{rows.map(([k, v], i) => <div className="ds-detail" key={i}><dt>{k}</dt><dd dangerouslySetInnerHTML={md(v)} /></div>)}</dl>}
    </Wrap>
  );
};

const ReleaseChecklist: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="release-checklist" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <ul className="ds-actions ds-release-list">
      {(b.gates || []).map((g: any, i: number) => {
        const id = g.id || slugify(g.title || "gate");
        const checked = g.status === "done" || g.status === "passed";
        return (
          <li className="ds-action ds-release-gate" data-release-row={id} key={id || i}>
            <label><input type="checkbox" data-release-gate={id} data-release-title={g.title || id} data-release-required={g.required ? "1" : "0"} defaultChecked={checked} /><span className="ds-action-title" dangerouslySetInnerHTML={md(g.title || id)} /></label>
            <span className="ds-action-meta">{g.required && <span className="ds-chip">required</span>}<span className={`ds-status s-${slugify(g.status || "todo")}`}>{g.status || "todo"}</span></span>
            <textarea data-release-notes={id} placeholder="Evidence, approver, blocker" defaultValue={g.evidence || ""} />
          </li>
        );
      })}
    </ul>
    <div className="ds-codeedit-actions"><button className="ds-btn ds-btn-line" type="button" data-export-release>Export release packet</button><button className="ds-btn ds-btn-line" type="button" data-import-release>Import</button></div>
  </Wrap>
);

const DecisionLog: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="decision-log" id={b.id}>
    <Heading id={b.id} text={b.title} />
    <SimpleProcessList items={b.decisions || []} cls="ds-decision" />
  </Wrap>
);

const Prose: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="prose" id={b.id}>
    {b.heading && <h2 id={b.id} data-edit={`${b.id}:heading`}>{b.heading}</h2>}
    <div className="ds-prose" data-edit={`${b.id}:markdown`} dangerouslySetInnerHTML={rich(b.markdown)} />
  </Wrap>
);

const Figure: React.FC<{ b: B }> = ({ b }) => {
  const src = b._src || b.src || "";
  return (
    <Wrap type="figure" id={b.id}>
      <figure className="ds-figure">
        {src && <img src={src} alt={b.alt || b.caption || ""} loading="lazy" />}
        {b.caption && <figcaption dangerouslySetInnerHTML={md(b.caption)} />}
      </figure>
    </Wrap>
  );
};

const Math: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="math" id={b.id}>
    {b._math ? (
      <div className={"ds-math" + (b.display === false ? " inline" : "")} dangerouslySetInnerHTML={raw(b._math)} />
    ) : (
      <div className={"ds-math" + (b.display === false ? " inline" : "")}><code>{b.tex || ""}</code></div>
    )}
  </Wrap>
);

const Footnotes: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="footnotes" id={b.id}>
    <h3 id={b.id}>{b.title || "Notes"}</h3>
    <ol className="ds-footnotes">
      {(b.items || []).map((it: any, i: number) => (
        <li id={`fn-${it.id}`} key={i}>
          <span dangerouslySetInnerHTML={md(it.text)} /> <a className="ds-fnback" href={`#fnref-${it.id}`} aria-label="Back to reference">↩</a>
        </li>
      ))}
    </ol>
  </Wrap>
);

const Chart: React.FC<{ b: B }> = ({ b }) => (
  <Wrap type="chart" id={b.id}>
    {b.title && <h3 id={b.id}>{b.title}</h3>}
    <div className="ds-chart" dangerouslySetInnerHTML={raw(chartSvg(b))} />
  </Wrap>
);

const Receipt: React.FC<{ b: B }> = ({ b }) => {
  const rows: [string, string][] = [];
  if (b.generatedBy) rows.push(["Generated by", b.generatedBy]);
  if (b.model) rows.push(["Model", b.model]);
  if (b.date) rows.push(["Date", b.date]);
  if (b.confidence) rows.push(["Confidence", b.confidence]);
  if (b.tools?.length) rows.push(["Tools", b.tools.join(", ")]);
  return (
    <Wrap type="receipt" id={b.id}>
      <aside className="ds-receipt">
        <div className="ds-receipt-head">{b.title || "Generation receipt"}</div>
        {rows.length > 0 && (
          <dl className="ds-detailgrid">
            {rows.map(([k, v], i) => (
              <div className="ds-detail" key={i}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
          </dl>
        )}
        {b.sources?.length > 0 && (
          <div className="ds-receipt-sources">
            <span className="ds-label">Sources</span>
            <ul>{b.sources.map((s: any, i: number) => <li key={i}>{s.url ? <a href={safeUrl(s.url)}>{s.label || s.url}</a> : s.label}</li>)}</ul>
          </div>
        )}
        {b.notes && <p className="ds-muted" dangerouslySetInnerHTML={md(b.notes)} />}
      </aside>
    </Wrap>
  );
};

export const Block: React.FC<{ b: B }> = ({ b }) => {
  switch (b.type) {
    case "hero": return <Hero b={b} />;
    case "prose": return <Prose b={b} />;
    case "section": return <Section b={b} />;
    case "two-col": return <TwoCol b={b} />;
    case "summary-cards": return <SummaryCards b={b} />;
    case "stat-strip": return <StatStrip b={b} />;
    case "flow": return <Flow b={b} />;
    case "timeline": return <Timeline b={b} />;
    case "table": return <Table b={b} />;
    case "callout": return <Callout b={b} />;
    case "code": return <Code b={b} />;
    case "code-editor": return <CodeEditor b={b} />;
    case "patch-set": return <PatchSet b={b} />;
    case "diff-view": return <DiffView b={b} />;
    case "tabs": return <Tabs b={b} />;
    case "faq": return <Faq b={b} />;
    case "references": return <References b={b} />;
    case "decision-matrix": return <DecisionMatrix b={b} />;
    case "risk-register": return <RiskRegister b={b} />;
    case "action-items": return <ActionItems b={b} />;
    case "assumptions": return <Assumptions b={b} />;
    case "glossary": return <Glossary b={b} />;
    case "diagram": return <Diagram b={b} />;
    case "review-board": return <ReviewBoard b={b} />;
    case "process-board": return <ProcessBoard b={b} />;
    case "verification-run": return <VerificationRun b={b} />;
    case "evidence-log": return <EvidenceLog b={b} />;
    case "trust-report": return <TrustReport b={b} />;
    case "verdict-gate": return <VerdictGate b={b} />;
    case "process-receipt": return <ProcessReceipt b={b} />;
    case "finding-list": return <FindingList b={b} />;
    case "comment-thread": return <CommentThread b={b} />;
    case "cycle-board": return <CycleBoard b={b} />;
    case "integration-report": return <IntegrationReport b={b} />;
    case "upstream-response": return <UpstreamResponse b={b} />;
    case "release-checklist": return <ReleaseChecklist b={b} />;
    case "decision-log": return <DecisionLog b={b} />;
    case "figure": return <Figure b={b} />;
    case "math": return <Math b={b} />;
    case "footnotes": return <Footnotes b={b} />;
    case "chart": return <Chart b={b} />;
    case "receipt": return <Receipt b={b} />;
    default: {
      // Plugin parity: a registered React component renders natively; otherwise, if the
      // Node generator knows the type (a string-renderer plugin), inject its HTML.
      const Custom = componentRegistry.get(b.type);
      if (Custom) return <Custom b={b} />;
      if (knownBlockTypes().includes(b.type)) return <div className="ds-pluginblock" dangerouslySetInnerHTML={raw(renderBlock(b, CTX))} />;
      return (
        <Wrap type={b.type} id={b.id}>
          <div className="ds-callout tone-warn">Unsupported block type: <code>{b.type}</code></div>
        </Wrap>
      );
    }
  }
};
