// Optional presentation skins layered after the base design system. Skins change
// layout density and component styling, while meta.theme remains the last word
// for project-specific token overrides.

export const SKINS = {
  "console-slate": {
    label: "Console Slate",
    css: `
:root{
  --ds-bg:#f7f8fa; --ds-bg-2:#ffffff; --ds-bg-3:#eef1f6;
  --ds-line:#e2e5ea; --ds-line-2:#d2d6dd; --ds-line-strong:#bcc2cd;
  --ds-ink:#1e2530; --ds-ink-2:#525a68; --ds-ink-3:#7a8494;
  --ds-ok:#2f9e44; --ds-warn:#c8870f; --ds-danger:#e03131; --ds-info:#2563ac;
  --ds-ok-tint:rgba(47,158,68,.11); --ds-warn-tint:rgba(200,135,15,.13); --ds-danger-tint:rgba(224,49,49,.10); --ds-info-tint:rgba(37,99,172,.10);
  --ds-accent:#3a5ccc; --ds-accent-2:#3350b8; --ds-accent-tint:rgba(58,92,204,.09); --ds-accent-tint-2:rgba(58,92,204,.16);
  --ds-shadow-color:222deg 32% 16%;
  --ds-ring:0 0 0 1px hsl(var(--ds-shadow-color)/.07);
  --ds-elev-1:var(--ds-ring),0 1px 2px hsl(var(--ds-shadow-color)/.05);
  --ds-elev-2:var(--ds-ring),0 2px 4px hsl(var(--ds-shadow-color)/.05),0 8px 20px -6px hsl(var(--ds-shadow-color)/.10);
  --ds-elev-3:var(--ds-ring),0 4px 10px hsl(var(--ds-shadow-color)/.06),0 16px 34px -8px hsl(var(--ds-shadow-color)/.14);
  --ds-grid:rgba(30,37,48,.025);
  --ds-tr-display:-.022em; --ds-tr-title:-.015em; --ds-tr-sub:-.006em; --ds-tr-caps:.06em;
  --ds-spring:cubic-bezier(.34,1.56,.64,1); --ds-t-fast:120ms; --ds-t-base:200ms;
  --ds-frame:1400px;
}
[data-theme="dark"]{
  --ds-bg:#0e131a; --ds-bg-2:#151c26; --ds-bg-3:#1c2530;
  --ds-line:#232c39; --ds-line-2:#2e3949; --ds-line-strong:#3d4b5c;
  --ds-ink:#e8edf3; --ds-ink-2:#aab4c2; --ds-ink-3:#7f8b9c;
  --ds-ok:#51cf66; --ds-warn:#ffc94d; --ds-danger:#ff6b6b; --ds-info:#7da9e8;
  --ds-ok-tint:rgba(81,207,102,.15); --ds-warn-tint:rgba(255,201,77,.15); --ds-danger-tint:rgba(255,107,107,.14); --ds-info-tint:rgba(125,169,232,.13);
  --ds-accent:#7d9bff; --ds-accent-2:#93abff; --ds-accent-tint:rgba(125,155,255,.15); --ds-accent-tint-2:rgba(125,155,255,.22);
  --ds-shadow-color:222deg 60% 3%;
  --ds-ring:0 0 0 1px hsl(0 0% 100%/.08);
  --ds-elev-1:var(--ds-ring),0 1px 2px hsl(var(--ds-shadow-color)/.4);
  --ds-elev-2:var(--ds-ring),0 2px 6px hsl(var(--ds-shadow-color)/.4),0 10px 26px -6px hsl(var(--ds-shadow-color)/.55);
  --ds-elev-3:var(--ds-ring),0 6px 14px hsl(var(--ds-shadow-color)/.5),0 18px 40px -8px hsl(var(--ds-shadow-color)/.65);
  --ds-grid:rgba(255,255,255,.03);
}
@media screen{
  body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background-image:linear-gradient(var(--ds-grid) 1px,transparent 1px),linear-gradient(90deg,var(--ds-grid) 1px,transparent 1px);background-size:34px 34px;-webkit-mask-image:radial-gradient(ellipse 120% 80% at 50% 0,#000,transparent 72%);mask-image:radial-gradient(ellipse 120% 80% at 50% 0,#000,transparent 72%)}
}
body{font-size:15.5px;line-height:1.5;font-feature-settings:'liga' 1,'calt' 1}
code,pre,.ds-mono,th{font-feature-settings:'zero' 1}
h1{letter-spacing:var(--ds-tr-display)} h2{letter-spacing:var(--ds-tr-title)} h3{letter-spacing:var(--ds-tr-sub)}
.ds-hero h1{letter-spacing:-.018em;text-wrap:balance}
.ds-stat strong,.ds-meta-item .ds-val,.ds-diff-summary,.ds-diff-filelink b,.ds-diff-stat,.ds-review-count,table{font-variant-numeric:tabular-nums lining-nums}
.ds-content>.ds-block+.ds-block{margin-top:32px}
.ds-content>.ds-block+.ds-section{margin-top:76px}
.ds-topbar{background:color-mix(in srgb,var(--ds-bg) 78%,transparent);backdrop-filter:blur(12px) saturate(140%);-webkit-backdrop-filter:blur(12px) saturate(140%);border-bottom:0;transition:box-shadow var(--ds-t-base) var(--ds-ease)}
.ds-topbar.is-stuck{box-shadow:0 10px 26px -18px hsl(var(--ds-shadow-color)/.5)}
@supports not (backdrop-filter:blur(1px)){.ds-topbar{background:var(--ds-bg)}}
.ds-mark{border-radius:3px;transform:rotate(45deg)}
.ds-content>.ds-section .ds-section-titles h2{font-family:var(--ds-serif);font-weight:480;font-size:25px;letter-spacing:-.014em;text-wrap:balance}
.ds-content>.ds-section .ds-section-titles h2::before{background:transparent;color:var(--ds-ink-3);font-family:var(--ds-mono);font-size:11px;font-weight:600;letter-spacing:var(--ds-tr-caps);padding:0;margin-bottom:7px;border-radius:0}
.ds-section-titles .ds-muted{font-size:clamp(15px,14px + .3vw,17px);line-height:1.5;color:var(--ds-ink-2);max-width:78ch;text-wrap:balance}
.ds-section-body .ds-section .ds-section-titles h2::before{display:none}
.ds-section-body .ds-section .ds-section-titles h2{font-size:18px}
@media (prefers-reduced-motion:no-preference){
  .ds-section:target>.ds-section-head,.ds-footnotes li:target{background:color-mix(in oklab,var(--ds-accent) 8%,transparent);transition:background .5s var(--ds-ease);border-radius:8px}
}
.ds-toc-link{border-left:0;padding:5px 10px;border-radius:7px;font-weight:520;transition:color var(--ds-t-fast) var(--ds-ease),background var(--ds-t-fast) var(--ds-ease)}
.ds-toc-link.lvl-2{padding-left:22px}
.ds-toc-link:hover{background:color-mix(in oklab,var(--ds-ink) 4%,transparent)}
.ds-toc-link.active{color:var(--ds-accent);font-weight:600;background:var(--ds-accent-tint);border-left:0}
[data-block="hero"]{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);column-gap:48px;align-items:start}
[data-block="hero"]>*{grid-column:1;min-width:0}
[data-block="hero"]>.ds-meta{grid-column:2;grid-row:1 / span 60;align-self:start;margin:0;padding:0;border:0;border-radius:13px;background:var(--ds-bg-2);box-shadow:var(--ds-elev-1);overflow:hidden;display:block}
[data-block="hero"]>.ds-meta .ds-meta-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 16px;border-top:1px solid var(--ds-line);grid-template-columns:none}
[data-block="hero"]>.ds-meta .ds-meta-item:first-child{border-top:0}
[data-block="hero"]>.ds-meta .ds-label{font-family:var(--ds-mono);font-size:10.5px;letter-spacing:.04em}
[data-block="hero"]>.ds-meta .ds-val{font-family:var(--ds-mono);font-size:13px;font-weight:560;text-align:right}
.ds-eyebrow{background:transparent;padding:0;color:var(--ds-accent);font-family:var(--ds-mono);font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;display:inline-flex;align-items:center;gap:8px}
.ds-eyebrow::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--ds-accent);box-shadow:0 0 0 3px var(--ds-accent-tint)}
.ds-pillrow{gap:7px}
.ds-pillrow .ds-pill{padding:5px 11px;border:1px solid var(--ds-line-2);background:var(--ds-bg-2);border-radius:7px;color:var(--ds-ink-2);font-weight:540}
.ds-pillrow .ds-pill::before{display:none}
@media (max-width:900px){
  [data-block="hero"]{grid-template-columns:1fr}
  [data-block="hero"]>.ds-meta{grid-column:1;grid-row:auto;margin-top:22px}
}
.ds-statgrid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--ds-line-2);border:0;border-radius:13px;overflow:hidden;box-shadow:var(--ds-elev-1)}
.ds-stat{border:0;border-radius:0;background:var(--ds-bg-2);padding:15px 18px}
.ds-stat:hover{transform:none;box-shadow:none}
.ds-stat strong{font-family:var(--ds-mono);font-size:28px}
.ds-stat span{margin-top:7px;font-size:12.5px}
.ds-cardgrid{gap:16px}
.ds-card{border:0;border-radius:13px;background:var(--ds-bg-2);box-shadow:var(--ds-elev-1);transition:box-shadow 380ms var(--ds-ease),transform 380ms var(--ds-ease)}
.ds-card.tone-accent{background:var(--ds-accent-tint)}
.ds-card.tone-highlight{background:var(--ds-info-tint)}
.ds-card.tone-success{background:var(--ds-ok-tint)}
.ds-card.tone-warning{background:var(--ds-warn-tint)}
.ds-card.tone-danger{background:var(--ds-danger-tint)}
.ds-card.tone-accent h3{color:var(--ds-accent)}
.ds-card.tone-highlight h3{color:var(--ds-info)}
.ds-card.tone-success h3{color:var(--ds-ok)}
.ds-card.tone-warning h3{color:var(--ds-warn)}
.ds-card.tone-danger h3{color:var(--ds-danger)}
@media (hover:hover){.ds-card:hover{transform:translateY(-1px);box-shadow:var(--ds-elev-2);transition-duration:var(--ds-t-fast)}}
.ds-callout{position:relative;border:0;box-shadow:var(--ds-ring);background:var(--ds-bg-2);border-radius:11px;padding:14px 16px 14px 46px;color:var(--ds-ink-2);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ds-callout strong{color:var(--ds-ink)}
.ds-callout::before{content:"i";position:absolute;left:14px;top:14px;width:22px;height:22px;border-radius:6px;background:var(--ds-ink-3);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center;font-family:var(--ds-font)}
.ds-callout.tone-tip{background:color-mix(in oklab,var(--ds-accent) 7%,var(--ds-bg-2))}
.ds-callout.tone-tip::before{content:"\\2726";background:var(--ds-accent)}
.ds-callout.tone-ok{background:var(--ds-ok-tint)}
.ds-callout.tone-ok::before{content:"\\2713";background:var(--ds-ok)}
.ds-callout.tone-warn{background:var(--ds-warn-tint)}
.ds-callout.tone-warn::before{content:"!";background:var(--ds-warn)}
.ds-callout.tone-danger{background:var(--ds-danger-tint)}
.ds-callout.tone-danger::before{content:"!";background:var(--ds-danger)}
.ds-callout.tone-info{background:var(--ds-info-tint)}
.ds-callout.tone-info::before{content:"i";background:var(--ds-info)}
[data-theme="dark"] .ds-callout::before{color:#0c0e13}
.ds-tablewrap{border:1px solid var(--ds-line-2);border-radius:12px;overflow:auto;box-shadow:var(--ds-ring)}
.ds-tablewrap table{font-size:14px}
th{background:var(--ds-bg-3);font-family:var(--ds-mono);font-size:10.5px;font-weight:600;letter-spacing:var(--ds-tr-caps);padding:9px 14px;border-bottom:1px solid var(--ds-line-2)}
td{padding:9px 14px;border-bottom:1px solid var(--ds-line)}
.ds-tablewrap tbody tr:last-child td{border-bottom:0}
tbody tr:nth-child(even) td{background:color-mix(in oklab,var(--ds-ink) 3%,transparent)}
tbody tr:hover td{background:color-mix(in oklab,var(--ds-accent) 5%,transparent)}
tr.ds-rec td{background:color-mix(in oklab,var(--ds-accent) 8%,transparent)}
tr.ds-rec:hover td{background:color-mix(in oklab,var(--ds-accent) 8%,transparent)}
tr.ds-rec td:first-child{font-weight:620;color:var(--ds-ink)}
.ds-rec .ds-pill{background:var(--ds-accent);color:#fff;border:0;font-family:var(--ds-mono);font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:5px}
.ds-rec .ds-pill::before{content:"\\2605 "}
[data-theme="dark"] .ds-rec .ds-pill{color:#0c0e13}
.ds-lvl{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-family:var(--ds-mono);font-size:11px;font-weight:620}
.ds-lvl::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
.ds-lvl.l-high{background:var(--ds-danger-tint);color:var(--ds-danger)}
.ds-lvl.l-medium{background:var(--ds-warn-tint);color:var(--ds-warn)}
.ds-lvl.l-low{background:var(--ds-ok-tint);color:var(--ds-ok)}
.ds-status{padding:3px 10px;border-radius:7px;font-family:var(--ds-mono);font-size:10.5px;letter-spacing:.02em}
.s-done,.s-shipped,.s-passed,.s-accepted,.s-verified,.s-applied,.s-resolved{color:var(--ds-ok);background:var(--ds-ok-tint)}
.s-failed,.s-rejected,.s-disputed,.s-blocked{color:var(--ds-danger);background:var(--ds-danger-tint)}
.s-in-progress,.s-doing,.s-proposed,.s-needs-revision,.s-planned,.s-pending,.s-review,.s-partial,.s-unverified,.s-opened{color:var(--ds-warn);background:var(--ds-warn-tint)}
.ds-chip{border-radius:6px;font-weight:540}
.ds-ritem{border-radius:11px}
.ds-pitem.verdict-approve,.ds-pitem.verdict-block,.ds-pitem.verdict-revise,.ds-pitem.verdict-retry,.ds-ritem.selected{border-color:var(--ds-line-2);box-shadow:var(--ds-elev-1)}
.ds-trust-claim{border:0;box-shadow:var(--ds-ring);border-radius:12px;padding:15px 17px;background:var(--ds-bg-2);-webkit-print-color-adjust:exact;print-color-adjust:exact}
.ds-trust-claim.status-verified,.ds-trust-claim.status-accepted{background:var(--ds-ok-tint)}
.ds-trust-claim.status-partial,.ds-trust-claim.status-unverified{background:var(--ds-warn-tint)}
.ds-trust-claim.status-disputed,.ds-trust-claim.status-rejected{background:var(--ds-danger-tint)}
.ds-detail{grid-template-columns:minmax(86px,max-content) 1fr;gap:10px 18px;padding:7px 0}
.ds-detail dt{font-family:var(--ds-mono);font-size:10.5px;letter-spacing:.03em}
.ds-receipt .ds-detail{grid-template-columns:minmax(96px,max-content) 1fr}
.ds-meta-item .ds-label,.ds-toc-head,.ds-notes span,.ds-codeedit-state{font-family:var(--ds-mono);letter-spacing:var(--ds-tr-caps);text-transform:uppercase}
.ds-code-bar .ds-lang,.ds-codeedit-bar .ds-lang{color:var(--ds-accent)}
.ds-twocol>div{display:grid;gap:18px;align-content:start}
.ds-diff-review{padding:13px 15px;display:grid;gap:11px}
.ds-diff-review label{display:grid;gap:5px;margin:0}
.ds-patch-review{padding:13px 15px;display:grid;gap:11px}
.ds-diff-meta-lines{padding:2px 15px 12px}
.ds-notes{padding-left:0;padding-right:0}
.ds-copy{top:12px;right:12px;background:var(--ds-bg-2);border-color:var(--ds-line-2);box-shadow:var(--ds-elev-1)}
.ds-section>.ds-copy{display:none}
.ds-release-gate{display:grid;grid-template-columns:1fr auto;gap:10px 16px;align-items:center;padding:15px 0}
.ds-release-gate>label{grid-column:1;min-width:0}
.ds-release-gate>.ds-action-meta{grid-column:2;justify-self:end;flex-wrap:wrap}
.ds-release-gate>textarea{grid-column:1 / -1;width:100%;min-height:64px}
:focus-visible{outline:2px solid var(--ds-accent);outline-offset:2px}
.ds-btn:focus-visible,.ds-menu>summary:focus-visible{box-shadow:0 0 0 4px color-mix(in oklab,var(--ds-accent) 22%,transparent)}
::selection{background:color-mix(in oklab,var(--ds-accent) 20%,transparent)}
button,summary,.ds-btn,.ds-copy,.ds-chip,.ds-status,.ds-pill,.ds-lvl,.ds-toggle,.ds-action label,.ds-toc-link{-webkit-user-select:none;user-select:none}
`,
    script: `
(function(){var t=document.querySelector('.ds-topbar');if(!t)return;
var f=function(){t.classList.toggle('is-stuck',(window.scrollY||document.documentElement.scrollTop)>2)};
addEventListener('scroll',f,{passive:true});f();})();
`,
  },
};

export function resolveSkin(name) {
  return name && SKINS[name] ? SKINS[name] : null;
}

export function skinNames() {
  return Object.keys(SKINS);
}
