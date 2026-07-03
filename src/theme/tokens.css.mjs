// Dossier design system, editorial/SaaS hybrid, denser layout, first-class
// responsive + iOS. Near-monochrome plum neutrals + one berry accent. No card
// accent strokes, no hero background wash. Light + dark.

export const CSS = `
:root{
  color-scheme:light dark;
  --ds-bg:#fbfbfc; --ds-bg-2:#f5f4f8; --ds-bg-3:#edebf1;
  --ds-line:#e8e6ee; --ds-line-2:#dcd9e4; --ds-line-strong:#c7c2d3;
  --ds-ink:#1a1822; --ds-ink-2:#56525f; --ds-ink-3:#8b8698;
  --ds-accent:#c81e4a; --ds-accent-2:#a8183d; --ds-accent-tint:rgba(200,30,74,.08);
  --ds-ok:#0f7a52; --ds-warn:#9a5b00; --ds-danger:#c0263b;
  --ds-ok-tint:rgba(15,122,82,.1); --ds-warn-tint:rgba(154,91,0,.12); --ds-danger-tint:rgba(192,38,59,.1);
  --ds-frame:1180px; --ds-rail:212px;
  --ds-font:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --ds-serif:Charter,"Bitstream Charter","Iowan Old Style","Palatino Linotype",Georgia,serif;
  --ds-mono:"Geist Mono",ui-monospace,"SF Mono",SFMono-Regular,Menlo,monospace;
  --ds-ease:cubic-bezier(.2,0,0,1);
}
[data-theme="dark"]{
  --ds-bg:#0e0d13; --ds-bg-2:#16141d; --ds-bg-3:#1e1b27;
  --ds-line:#2c2937; --ds-line-2:#3b3749; --ds-line-strong:#524c63;
  --ds-ink:#eceaf1; --ds-ink-2:#a8a3b6; --ds-ink-3:#7b7689;
  --ds-accent:#ff6b88; --ds-accent-2:#ff8aa0; --ds-accent-tint:rgba(255,107,136,.12);
  --ds-ok:#34d399; --ds-warn:#fbbf24; --ds-danger:#fb7185;
  --ds-ok-tint:rgba(52,211,153,.12); --ds-warn-tint:rgba(251,191,36,.12); --ds-danger-tint:rgba(251,113,133,.12);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%;scroll-padding-top:66px}
body{margin:0;background:var(--ds-bg);color:var(--ds-ink);font-family:var(--ds-font);font-size:16px;line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden;-webkit-tap-highlight-color:transparent}
::selection{background:var(--ds-accent-tint)}
a{color:var(--ds-accent);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:2px}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--ds-accent);outline-offset:2px;border-radius:5px}
.ds-tabbar,.ds-tablewrap,pre,.ds-diff-lines,.ds-diff-empty,.ds-math{scrollbar-width:none}
.ds-tabbar::-webkit-scrollbar,.ds-tablewrap::-webkit-scrollbar,pre::-webkit-scrollbar,.ds-diff-lines::-webkit-scrollbar,.ds-diff-empty::-webkit-scrollbar,.ds-math::-webkit-scrollbar{display:none}
h1,h2,h3,h4{font-weight:640;letter-spacing:-.014em;scroll-margin-top:66px}
h1{font-size:30px;line-height:1.18;letter-spacing:-.02em}
h2{font-size:22px;line-height:1.24;letter-spacing:-.015em;margin:0 0 5px}
h3{font-size:17.5px;line-height:1.3;letter-spacing:-.006em;margin:0 0 4px}
h4{font-size:15px;margin:0 0 3px}
p{margin:0 0 13px}
ul,ol{margin:0 0 13px;padding-left:21px}
li{margin:5px 0}
strong{font-weight:640}
code{font-family:var(--ds-mono);font-size:.86em;background:var(--ds-bg-2);border:1px solid var(--ds-line);border-radius:5px;padding:.5px 5px;color:var(--ds-ink)}
.ds-prose p:last-child,.ds-prose-list:last-child{margin-bottom:0}
.ds-prose-list{color:var(--ds-ink-2)}
.ds-prose-list strong{color:var(--ds-ink)}
.ds-muted{color:var(--ds-ink-2)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}

.ds-progress{position:fixed;inset:0 0 auto 0;height:2px;z-index:60}
.ds-progress-bar{height:100%;width:0;background:linear-gradient(90deg,var(--ds-accent),var(--ds-accent-2))}
.ds-skip{position:fixed;left:14px;top:10px;z-index:100;transform:translateY(-140%);background:var(--ds-ink);color:var(--ds-bg);border-radius:8px;padding:8px 12px;font-size:13px;font-weight:650;box-shadow:0 10px 30px rgba(20,16,40,.18)}
.ds-skip:focus{transform:none;text-decoration:none}

.ds-shell{width:min(var(--ds-frame),calc(100% - 48px));margin:0 auto;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}

/* top bar */
.ds-topbar{position:sticky;top:0;z-index:40;display:flex;align-items:center;justify-content:space-between;gap:14px;height:54px;background:var(--ds-bg);border-bottom:1px solid var(--ds-line)}
.ds-brand{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.ds-mark{width:9px;height:9px;border-radius:50%;background:var(--ds-accent);box-shadow:0 0 0 4px var(--ds-accent-tint);flex:none}
.ds-crumbs{color:var(--ds-ink);font-size:14.5px;font-weight:580;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-tools{display:flex;align-items:center;gap:8px;flex:none}
.ds-btn{display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 11px;border:0;background:transparent;color:var(--ds-ink-2);font-size:13px;font-weight:560;border-radius:9px;cursor:pointer;transition:background .12s var(--ds-ease),color .12s var(--ds-ease),border-color .12s var(--ds-ease),transform .1s var(--ds-ease)}
.ds-btn:hover{background:var(--ds-bg-2);color:var(--ds-ink)}
.ds-btn .ds-i{flex:none;display:flex}
.ds-btn kbd{font-family:var(--ds-mono);font-size:11px;color:var(--ds-ink-3);border:1px solid var(--ds-line-2);border-radius:5px;padding:1px 5px}
.ds-search-btn{border:1px solid var(--ds-line-2);background:var(--ds-bg-2);min-width:172px;justify-content:flex-start;color:var(--ds-ink-3)}
.ds-search-btn .ds-search-label{margin-right:auto}
.ds-search-btn:hover{border-color:var(--ds-line-strong);background:var(--ds-bg-2);color:var(--ds-ink-2)}
.ds-btn[data-theme-toggle]{width:40px;height:40px;padding:0;justify-content:center;font-size:20px;line-height:1;color:var(--ds-ink-2)}
.ds-btn[data-theme-toggle]:hover{background:transparent;color:var(--ds-accent)}
.ds-menu{position:relative}
.ds-menu>summary{list-style:none;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 13px;border:1px solid var(--ds-line-2);background:var(--ds-bg-2);color:var(--ds-ink);font-size:13px;font-weight:580;border-radius:9px;cursor:pointer}
.ds-menu>summary::-webkit-details-marker{display:none}
.ds-menu>summary::after{content:"▾";font-size:11px;color:var(--ds-ink-3)}
.ds-menu>summary:hover{border-color:var(--ds-line-strong);background:var(--ds-bg-3)}
.ds-menu-list{position:absolute;right:0;top:42px;min-width:206px;display:grid;padding:6px;background:var(--ds-bg);border:1px solid var(--ds-line-2);border-radius:12px;box-shadow:0 14px 38px rgba(20,16,40,.14);z-index:50}
.ds-menu-list button{justify-content:flex-start;width:100%;height:36px;padding:0 11px;color:var(--ds-ink);font-weight:520}
.ds-dirty-status{display:inline-flex;align-items:center;height:26px;padding:0 9px;border-radius:999px;background:var(--ds-accent-tint);color:var(--ds-accent);font-size:11.5px;font-weight:680;font-variant-numeric:tabular-nums;white-space:nowrap}
.ds-dirty-status[hidden]{display:none}
.ds-tool-modal{position:fixed;inset:0;z-index:85;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(15,14,20,.38)}
.ds-tool-modal[hidden]{display:none}
.ds-tool-card{width:min(760px,100%);max-height:88vh;display:grid;gap:14px;overflow:auto;background:var(--ds-bg);border:1px solid var(--ds-line-2);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.22);padding:16px}
.ds-tool-wide{width:min(1040px,100%)}
.ds-tool-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;padding-bottom:12px;border-bottom:1px solid var(--ds-line)}
.ds-tool-head strong{display:block;font-size:15px}
.ds-tool-head p,.ds-tool-note{margin:4px 0 0;color:var(--ds-ink-3);font-size:12.5px}
.ds-export-grid{display:flex;flex-wrap:wrap;gap:8px}
.ds-export-grid .ds-btn,.ds-tool-actions .ds-btn{justify-content:center;border:1px solid var(--ds-line-2);background:var(--ds-bg);color:var(--ds-ink-2)}
.ds-export-grid .ds-btn:not(.ds-btn-line),.ds-tool-actions .ds-btn:not(.ds-btn-line){background:var(--ds-bg-2);color:var(--ds-ink)}
.ds-export-grid .ds-btn:hover,.ds-tool-actions .ds-btn:hover{border-color:var(--ds-line-strong);background:var(--ds-bg-3);color:var(--ds-ink)}
.ds-export-preview-head{display:flex;align-items:center;justify-content:space-between;color:var(--ds-ink-2);font-size:12px}
.ds-export-preview{width:100%;min-height:220px;border:1px solid var(--ds-line-2);border-radius:10px;background:var(--ds-bg-2);color:var(--ds-ink);font:12px/1.55 var(--ds-mono);padding:12px;resize:vertical}
.ds-revision-result{min-height:96px}
.ds-file-btn{display:inline-flex;align-items:center;height:36px;padding:0 11px;border:1px solid var(--ds-line-2);border-radius:9px;background:var(--ds-bg);color:var(--ds-ink-2);font-size:13px;font-weight:560;cursor:pointer}
.ds-file-btn:focus-visible{outline:2px solid var(--ds-accent);outline-offset:2px;border-color:var(--ds-line-strong)}
.ds-file-btn input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.ds-blockedit-list{display:grid;gap:8px}
.ds-blockedit-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;gap:8px;align-items:center;border:1px solid var(--ds-line-2);border-radius:10px;background:var(--ds-bg-2);padding:8px}
.ds-blockedit-row b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.ds-blockedit-row .ds-btn{height:30px}
.ds-tool-row{display:grid;grid-template-columns:160px minmax(0,1fr) auto;gap:8px;align-items:center}
.ds-tool-row input,.ds-tool-row select,.ds-field-grid input,.ds-field-grid select,.ds-field-grid textarea{width:100%;border:1px solid var(--ds-line-2);border-radius:8px;background:var(--ds-bg);color:var(--ds-ink);padding:8px 9px;font:13px var(--ds-font)}
.ds-field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.ds-field-grid label{display:grid;gap:5px;color:var(--ds-ink-3);font-size:12px;font-weight:650}
.ds-field-grid .wide{grid-column:1/-1}
.ds-field-grid textarea{min-height:110px;resize:vertical;line-height:1.45}
.ds-tool-actions{display:flex;justify-content:flex-end}

.ds-lifecycle{display:inline-flex;align-items:center;gap:9px;margin:22px 0 0;padding:6px 13px;background:var(--ds-bg-2);border:1px solid var(--ds-line);border-radius:999px;color:var(--ds-ink-2);font-size:12.5px}
.ds-lifecycle b{display:inline-flex;align-items:center;gap:7px;color:var(--ds-ink);font-weight:600;text-transform:capitalize}
.ds-lifecycle b::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ds-warn);box-shadow:0 0 0 3px var(--ds-warn-tint)}
.ds-lifecycle.stage-durable b::before{background:var(--ds-ok);box-shadow:0 0 0 3px var(--ds-ok-tint)}
.ds-lifecycle.stage-review b::before{background:var(--ds-accent);box-shadow:0 0 0 3px var(--ds-accent-tint)}

/* layout */
.ds-layout{display:grid;grid-template-columns:minmax(0,1fr) var(--ds-rail);gap:56px;padding:10px 0 96px;align-items:start}
.ds-layout.no-toc{grid-template-columns:1fr}
.ds-content{min-width:0;grid-column:1;counter-reset:sec}
.ds-toc{grid-column:2;position:sticky;top:74px;display:grid;gap:0;font-size:12.5px;align-self:start}
.ds-toc .ds-search{margin:0 0 14px}
.ds-toc .ds-search input{width:100%;height:34px;border:1px solid var(--ds-line-2);border-radius:9px;background:var(--ds-bg-2);padding:0 11px;font-size:13px;outline:0}
.ds-toc .ds-search input:focus{border-color:var(--ds-line-strong);background:var(--ds-bg)}
.ds-toc-head{color:var(--ds-ink-3);font-size:11px;font-weight:680;letter-spacing:.07em;text-transform:uppercase;margin-bottom:10px}
.ds-toc-link{display:block;padding:4px 0 4px 14px;color:var(--ds-ink-3);border-left:1.5px solid var(--ds-line);font-weight:520;transition:color .12s var(--ds-ease),border-color .12s var(--ds-ease)}
.ds-toc-link.lvl-2{padding-left:25px}
.ds-toc-link:hover{color:var(--ds-ink)}
.ds-toc-link.active{color:var(--ds-accent);border-left-color:var(--ds-accent)}

.ds-block{position:relative;min-width:0}
.ds-content>.ds-block+.ds-block{margin-top:34px}
.ds-content>.ds-block+.ds-section{margin-top:50px}
.ds-content>.ds-section{counter-increment:sec}
.ds-copy{position:absolute;top:8px;right:8px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:27px;height:27px;opacity:0;border:1px solid var(--ds-line);border-radius:8px;background:var(--ds-bg);color:var(--ds-ink-3);cursor:pointer;box-shadow:0 1px 2px rgba(20,16,40,.04);transition:opacity .12s var(--ds-ease),color .12s,background .12s,border-color .12s}
.ds-block:hover>.ds-copy{opacity:1}
.ds-copy:hover{color:var(--ds-ink);background:var(--ds-bg-2);border-color:var(--ds-line-strong)}
.ds-copy svg{display:block}
.ds-block[data-block="code"]>.ds-copy,.ds-block[data-block="diagram"]>.ds-copy{display:none}

/* in-place edit mode */
html.ds-editing .ds-btn[data-edit-toggle]{background:var(--ds-accent-tint);color:var(--ds-accent)}
.ds-editing [data-edit]{outline:1px dashed var(--ds-line-strong);outline-offset:3px;border-radius:4px;cursor:text}
.ds-editing [data-edit]:hover{outline-color:var(--ds-accent)}
.ds-editing [data-edit]:focus{outline:2px solid var(--ds-accent);outline-offset:3px}

/* theme studio */
.ds-swatch{width:34px;padding:0;justify-content:center}
.ds-swatch span{width:14px;height:14px;border-radius:50%;background:var(--ds-accent);box-shadow:0 0 0 1px var(--ds-line-2)}
.ds-studio{position:fixed;right:18px;top:62px;z-index:70;width:min(330px,calc(100vw - 28px));background:var(--ds-bg);border:1px solid var(--ds-line-2);border-radius:14px;box-shadow:0 18px 44px rgba(20,16,40,.18);padding:14px;display:grid;gap:10px}
.ds-studio[hidden]{display:none}
.ds-studio-head{display:flex;justify-content:space-between;align-items:center;font-size:13px}
.ds-studio-row{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:560;color:var(--ds-ink-2)}
.ds-studio-row input[type=color]{width:46px;height:28px;border:1px solid var(--ds-line-2);border-radius:7px;background:none;cursor:pointer;padding:2px}
.ds-studio-row input[type=text],.ds-studio-select,.ds-studio-json{border:1px solid var(--ds-line-2);border-radius:8px;background:var(--ds-bg-2);color:var(--ds-ink);font:12.5px var(--ds-mono);outline:0}
.ds-studio-row input[type=text]{width:92px;padding:6px 8px;text-align:right}
.ds-studio-presets{display:flex;flex-wrap:wrap;gap:8px}
.ds-studio-sw{width:26px;height:26px;border-radius:50%;border:1px solid var(--ds-line-2);cursor:pointer;padding:0;transition:transform .1s var(--ds-ease)}
.ds-studio-sw:hover{transform:scale(1.1)}
.ds-studio-select{width:100%;padding:7px 8px;font-family:inherit}
.ds-studio-json{width:100%;min-height:108px;resize:vertical;padding:9px;line-height:1.4}
.ds-studio-actions{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.ds-studio-actions [data-studio-reset]{grid-column:1/-1}
.ds-studio-actions .ds-btn-line{justify-content:center}
mark{background:var(--ds-accent-tint);color:inherit;border-radius:3px;padding:0 2px}

/* hero, no background wash */
.ds-hero{padding:34px 0 4px}
.ds-eyebrow{display:inline-flex;align-items:center;margin:0 0 15px;padding:5px 12px;background:var(--ds-accent-tint);color:var(--ds-accent);font-size:12px;font-weight:600;letter-spacing:.02em;border-radius:999px}
.ds-hero h1{font-family:var(--ds-serif);font-weight:400;font-size:clamp(30px,4.2vw,44px);line-height:1.08;letter-spacing:-.022em;margin:0;max-width:20ch}
.ds-lede{max-width:62ch;margin:18px 0 0;color:var(--ds-ink-2);font-size:18px;line-height:1.5}
.ds-pillrow{display:flex;flex-wrap:wrap;gap:0;margin-top:20px;color:var(--ds-ink-3);font-size:12.5px;font-weight:520}
.ds-pill{position:relative;padding:0 14px}
.ds-pill:first-child{padding-left:0}
.ds-pill+.ds-pill::before{content:"";position:absolute;left:0;top:50%;width:3px;height:3px;border-radius:50%;background:var(--ds-line-strong);transform:translateY(-50%)}
.ds-meta{display:flex;flex-wrap:wrap;gap:30px;margin-top:24px;padding-top:20px;border-top:1px solid var(--ds-line)}
.ds-meta-item{display:grid;gap:3px}
.ds-meta-item .ds-label{color:var(--ds-ink-3);font-size:11px;font-weight:680;letter-spacing:.06em;text-transform:uppercase}
.ds-meta-item .ds-val{color:var(--ds-ink);font-size:14.5px;font-weight:560}

/* section */
.ds-section{padding-top:32px;border-top:1px solid var(--ds-line-2)}
.ds-section.unframed{border-top:0;padding-top:0}
.ds-section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
.ds-section-titles{flex:1;min-width:0}
.ds-content>.ds-section .ds-section-titles h2::before{content:"§ " counter(sec,decimal-leading-zero);display:flex;align-items:center;width:fit-content;background:var(--ds-accent-tint);color:var(--ds-accent);font-family:var(--ds-mono);font-size:11.5px;font-weight:600;letter-spacing:.07em;padding:4px 10px;border-radius:999px;margin-bottom:12px}
.ds-section-titles .ds-muted{margin:7px 0 0;font-size:15px}
.ds-toggle{flex:none;display:inline-flex;align-items:center;justify-content:center;border:0;background:transparent;color:var(--ds-ink-3);width:28px;height:28px;border-radius:8px;cursor:pointer;transition:background .12s,color .12s}
.ds-toggle:hover{background:var(--ds-bg-2);color:var(--ds-ink)}
.ds-toggle svg{transition:transform .2s var(--ds-ease)}
.ds-section[data-collapsed="1"] .ds-toggle svg{transform:rotate(-90deg)}
.ds-section-body{display:grid;gap:18px}
.ds-section-body>*{min-width:0}
.ds-section[data-collapsed="1"] .ds-section-body{display:none}

.ds-twocol{display:grid;grid-template-columns:1fr 1fr;gap:28px}

/* outlined cards (equal-size) */
.ds-cardgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}
.ds-card{padding:17px 19px;border:1px solid var(--ds-line-2);border-radius:13px;background:var(--ds-bg);transition:border-color .14s var(--ds-ease),transform .14s var(--ds-ease)}
.ds-card h3{font-size:15.5px;margin:0 0 7px}
.ds-card p{margin:0;color:var(--ds-ink-2);font-size:14.5px}

.ds-statgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.ds-stat{padding:16px 18px;border:1px solid var(--ds-line-2);border-radius:13px;background:var(--ds-bg)}
.ds-stat strong{display:block;font-size:30px;font-weight:600;letter-spacing:-.022em;line-height:1;font-variant-numeric:tabular-nums}
.ds-stat span{display:block;margin-top:8px;color:var(--ds-ink-2);font-size:13px}
.ds-stat-delta{display:block;margin-top:10px;color:var(--ds-ink-3);font-size:12px;font-weight:620;font-variant-numeric:tabular-nums}
.ds-stat-delta span{display:inline;margin:0;color:inherit;font-size:inherit}
.ds-stat-delta.tone-up,.ds-stat-delta.tone-positive,.ds-stat-delta.tone-good{color:var(--ds-ok)}
.ds-stat-delta.tone-down,.ds-stat-delta.tone-negative,.ds-stat-delta.tone-bad{color:var(--ds-danger)}
.ds-stat-delta.tone-warn,.ds-stat-delta.tone-warning{color:var(--ds-warn)}

/* flow */
.ds-flow{position:relative;display:grid;counter-reset:flow}
.ds-flow::before{content:"";position:absolute;left:15px;top:24px;bottom:24px;width:1px;background:var(--ds-line)}
.ds-flowstep{position:relative;display:grid;grid-template-columns:32px 1fr;gap:18px;padding:15px 0;border-top:1px solid var(--ds-line);align-items:start}
.ds-flowstep:first-child{border-top:0}
.ds-flowstep::before{position:relative;z-index:1;counter-increment:flow;content:counter(flow,decimal-leading-zero);display:inline-flex;align-items:center;justify-content:center;width:32px;height:24px;background:var(--ds-bg);font-family:var(--ds-mono);font-size:12.5px;color:var(--ds-accent);padding-top:3px}
.ds-flowstep-body strong{display:block;margin-bottom:3px;font-size:15.5px}
.ds-flowstep-body span{color:var(--ds-ink-2);font-size:15px}

/* timeline */
.ds-timeline{position:relative;display:grid}
.ds-timeline::before{content:"";position:absolute;left:131px;top:24px;bottom:24px;width:1px;background:var(--ds-line)}
.ds-phase{position:relative;display:grid;grid-template-columns:120px 1fr;gap:24px;padding:15px 0;border-top:1px solid var(--ds-line)}
.ds-phase:first-child{border-top:0}
.ds-phase::before{content:"";position:absolute;left:124px;top:24px;width:15px;height:15px;border-radius:50%;background:var(--ds-bg);border:1px solid var(--ds-line-strong)}
.ds-phase-id{display:flex;flex-direction:column;gap:7px;color:var(--ds-ink);font-weight:600;font-size:14.5px;align-items:flex-start}
.ds-date{color:var(--ds-ink-3);font-size:12px;font-weight:500}
.ds-phase>div:last-child{color:var(--ds-ink-2)}

/* tables (pan on narrow screens without exposing nested scroll chrome) */
.ds-tablewrap{overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch}
table{width:100%;border-collapse:collapse;font-size:14.5px;margin:0}
th,td{text-align:left;padding:10px 16px 10px 0;border-bottom:1px solid var(--ds-line);vertical-align:top}
th{color:var(--ds-ink-3);font-size:11px;font-weight:680;letter-spacing:.05em;text-transform:uppercase;border-bottom-color:var(--ds-line-2);white-space:nowrap}
td{color:var(--ds-ink-2)}
td strong{color:var(--ds-ink)}
tr.ds-rec td{color:var(--ds-ink)}

/* chips */
.ds-status,.ds-lvl,.ds-akind,.ds-astatus,.ds-badge{display:inline-block;font-size:11px;font-weight:620;letter-spacing:.02em}
.ds-status{padding:2px 9px;border-radius:999px;background:var(--ds-bg-3);color:var(--ds-ink-2);text-transform:capitalize}
.s-done,.s-shipped{color:var(--ds-ok);background:var(--ds-ok-tint)} .s-in-progress,.s-doing{color:var(--ds-accent);background:var(--ds-accent-tint)} .s-blocked{color:var(--ds-danger);background:var(--ds-danger-tint)}
.ds-lvl{text-transform:capitalize}
.ds-lvl.l-high{color:var(--ds-danger)} .ds-lvl.l-medium{color:var(--ds-warn)} .ds-lvl.l-low{color:var(--ds-ok)}

/* callout */
.ds-callout{border-left:2px solid var(--ds-line-strong);padding:2px 0 2px 18px;color:var(--ds-ink-2)}
.ds-callout strong{color:var(--ds-ink)}
.ds-callout.tone-tip{border-left-color:var(--ds-accent)}
.ds-callout.tone-ok{border-left-color:var(--ds-ok)}
.ds-callout.tone-warn{border-left-color:var(--ds-warn)}
.ds-callout.tone-danger{border-left-color:var(--ds-danger)}

/* code */
.ds-code,.ds-diagram{border:1px solid var(--ds-line);border-radius:11px;overflow:hidden;background:var(--ds-bg-2)}
.ds-code-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 14px;font-family:var(--ds-mono);font-size:12px;color:var(--ds-ink-3);border-bottom:1px solid var(--ds-line)}
.ds-code-bar .ds-lang{color:var(--ds-accent);letter-spacing:.02em}
.ds-code-copy{border:1px solid var(--ds-line-2);background:var(--ds-bg);color:var(--ds-ink-3);font-family:var(--ds-font);font-size:11.5px;font-weight:560;border-radius:7px;padding:3px 10px;cursor:pointer;transition:color .12s,border-color .12s,transform .1s}
.ds-code-copy:hover{color:var(--ds-ink);border-color:var(--ds-line-strong)}
pre{margin:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding:15px;font-family:var(--ds-mono);font-size:13px;line-height:1.6;color:var(--ds-ink)}
pre code{background:transparent;border:0;padding:0;font-size:inherit}
/* Shiki dual-theme highlighting (build-time, no client JS) */
.ds-code .shiki{background:transparent!important;margin:0}
.ds-code .shiki,.ds-code .shiki span{color:var(--shiki-light)}
[data-theme="dark"] .ds-code .shiki,[data-theme="dark"] .ds-code .shiki span{color:var(--shiki-dark)}
/* Graphviz diagram, baked to inline SVG */
.ds-diagram-svg{display:flex;justify-content:center;padding:18px;background:#fff;border:0}
.ds-diagram-svg svg{max-width:100%;height:auto}

/* code editor */
.ds-codeedit{border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg);overflow:hidden;margin-top:12px}
.ds-codeedit.dirty{border-color:var(--ds-accent)}
.ds-codeedit-bar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:9px 14px;border-bottom:1px solid var(--ds-line);background:var(--ds-bg-2);font-family:var(--ds-mono);font-size:12px;color:var(--ds-ink-3)}
.ds-codeedit-bar .ds-lang{color:var(--ds-accent)}
.ds-codeedit-bar .ds-lang,.ds-code-bar .ds-lang{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ds-codeedit-meta{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;font-family:var(--ds-font);min-width:0}
.ds-codeedit-meta span{border:1px solid var(--ds-line-2);border-radius:999px;padding:2px 8px;background:var(--ds-bg);font-size:11.5px;color:var(--ds-ink-2)}
.ds-codeedit-area{display:block;width:100%;min-height:220px;border:0;border-radius:0;background:var(--ds-bg);color:var(--ds-ink);font-family:var(--ds-mono);font-size:13px;line-height:1.55;padding:14px 16px;resize:vertical;tab-size:2;overflow:hidden}
.ds-codeedit-area:focus{outline:2px solid var(--ds-accent-tint);outline-offset:-2px}
.ds-codeedit-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end;padding:10px 12px;border-top:1px solid var(--ds-line);background:var(--ds-bg-2)}
.ds-codeedit-state{margin-right:auto;color:var(--ds-ink-3);font-size:12px;font-weight:680;letter-spacing:.04em;text-transform:uppercase}
.ds-codeedit.dirty .ds-codeedit-state{color:var(--ds-accent)}

/* process block family */
.ds-process-list{display:grid;gap:10px;margin-top:14px;min-width:0}
.ds-process-card{border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg);padding:14px 16px;min-width:0;overflow-wrap:anywhere}
.ds-process-card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
.ds-process-card h4{margin:0 0 4px;font-size:15.5px}
.ds-gate{border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg);padding:14px 16px;margin-top:12px}
.ds-comments{margin:10px 0 0;padding-left:20px;color:var(--ds-ink-2)}
.ds-comments li+li{margin-top:8px}
.ds-comments p{margin:4px 0 0}
.ds-release-list{display:grid;gap:10px}
.ds-release-gate{display:grid;gap:8px}
.ds-release-gate textarea{min-height:58px}
.ds-finding .ds-chip{border-color:rgba(214,48,49,.26)}
.ds-vrun .ds-chip{border-color:rgba(18,161,104,.26)}
.ds-trust-sources{margin-top:14px}
.ds-trust-sources h4{margin:0 0 8px;color:var(--ds-ink)}
.ds-trust-sources table{font-size:13.5px}
.ds-trust-claims{margin-top:14px}
.ds-trust-claim{border-left:3px solid var(--ds-line-strong)}
.ds-trust-claim.status-verified,.ds-trust-claim.status-accepted{border-left-color:var(--ds-ok)}
.ds-trust-claim.status-disputed,.ds-trust-claim.status-rejected{border-left-color:var(--ds-danger)}
.ds-trust-claim.status-partial,.ds-trust-claim.status-unverified{border-left-color:var(--ds-warn)}
.ds-trust-refs{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid var(--ds-line)}
.ds-trust-link{text-decoration:none}
.ds-trust-missing{color:var(--ds-danger);border-color:rgba(214,48,49,.3)}

/* patch and diff blocks */
.ds-patchlist{display:grid;gap:12px;margin-top:14px}
.ds-patch{border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg);padding:15px 17px}
.ds-patch-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
.ds-patch h4{margin:0 0 4px;font-size:15.5px}
.ds-patch .ds-detailgrid{margin-top:12px}
.ds-patch-review,.ds-diff-review{display:grid;gap:9px;margin-top:12px}
.ds-patch-review label,.ds-diff-review label,.ds-hunk-head label{display:grid;gap:4px;color:var(--ds-ink-3);font-size:12px;font-weight:650}
.ds-patch-review select,.ds-diff-review select,.ds-hunk-head select{border:1px solid var(--ds-line-2);border-radius:7px;background:var(--ds-bg);color:var(--ds-ink);padding:5px 7px;font:12px var(--ds-font)}
.ds-patch-review textarea,.ds-diff-review textarea,.ds-diff-comment{width:100%;min-height:54px;border:1px solid var(--ds-line-2);border-radius:8px;background:var(--ds-bg);color:var(--ds-ink);padding:8px 9px;font:13px/1.45 var(--ds-font);resize:vertical}
.ds-diffview{margin-top:15px}
.ds-diffview.nested{border-top:1px solid var(--ds-line);padding-top:14px}
.ds-diff-summary{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;color:var(--ds-ink-2);font-size:12.5px;font-weight:650;font-variant-numeric:tabular-nums}
.ds-diff-summary span{border:1px solid var(--ds-line-2);border-radius:999px;padding:3px 9px;background:var(--ds-bg)}
.ds-diff-summary .add{color:var(--ds-ok);border-color:rgba(18,161,104,.3)}
.ds-diff-summary .del{color:var(--ds-danger);border-color:rgba(214,48,49,.3)}
.ds-diff-files{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.ds-diff-filelink{display:inline-flex;gap:8px;align-items:center;max-width:100%;border:1px solid var(--ds-line-2);border-radius:8px;padding:6px 9px;color:var(--ds-ink-2);font-size:12px;text-decoration:none}
.ds-diff-filelink span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
.ds-diff-filelink b{color:var(--ds-ink-3);font-weight:650;font-variant-numeric:tabular-nums}
.ds-diff-file{border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg);overflow:hidden;margin-top:10px}
.ds-diff-file summary{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 14px;cursor:pointer;background:var(--ds-bg-2);font-weight:650}
.ds-diff-path{font-family:var(--ds-mono);font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ds-diff-stat{font-size:12px;color:var(--ds-ink-3);font-variant-numeric:tabular-nums}
.ds-diff-meta-lines{display:grid;gap:2px;padding:9px 14px;border-top:1px solid var(--ds-line);font-family:var(--ds-mono);font-size:12px;color:var(--ds-ink-3);background:var(--ds-bg)}
.ds-hunk{border-top:1px solid var(--ds-line)}
.ds-hunk-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:7px 14px;background:var(--ds-accent-tint);color:var(--ds-accent);font-family:var(--ds-mono);font-size:12px;font-weight:650}
.ds-hunk-head label{min-width:138px;color:var(--ds-ink-2);font-family:var(--ds-font)}
.ds-diff-comment{border-radius:0;border-left:0;border-right:0;border-top:0}
.ds-diff-lines{margin:0;overflow-x:auto;overflow-y:hidden;background:var(--ds-bg);font-family:var(--ds-mono);font-size:12.5px;line-height:1.5}
.ds-diff-line{display:grid;grid-template-columns:46px 46px 22px minmax(0,1fr);min-width:min(520px,100%)}
.ds-diff-line span{padding:0 7px}
.ds-diff-num{color:var(--ds-ink-3);text-align:right;border-right:1px solid var(--ds-line);user-select:none}
.ds-diff-mark{color:var(--ds-ink-3);text-align:center;user-select:none}
.ds-diff-code{white-space:pre}
.ds-diff-line.add{background:rgba(18,161,104,.1)}
.ds-diff-line.add .ds-diff-mark,.ds-diff-line.add .ds-diff-code{color:var(--ds-ok)}
.ds-diff-line.del{background:rgba(214,48,49,.09)}
.ds-diff-line.del .ds-diff-mark,.ds-diff-line.del .ds-diff-code{color:var(--ds-danger)}
.ds-diff-line.meta{color:var(--ds-ink-3);background:var(--ds-bg-2)}
.ds-diff-empty{padding:14px;overflow-x:auto;overflow-y:hidden;border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg);font-family:var(--ds-mono)}

/* figure */
.ds-figure{margin:0;display:grid;gap:9px}
.ds-figure img{display:block;max-width:100%;height:auto;border:1px solid var(--ds-line);border-radius:12px}
.ds-figure figcaption{color:var(--ds-ink-3);font-size:13px;text-align:center}

/* math (KaTeX MathML, native render) */
.ds-math{overflow-x:auto;overflow-y:hidden;text-align:center;font-size:1.05em;line-height:1.45;padding:6px 2px 8px}
.ds-math.inline{display:inline-block;text-align:left}
.ds-math math{font-size:1.15em}

/* footnotes */
.ds-fnref{font-size:.72em;line-height:0}
.ds-fnref a{padding:0 1px}
.ds-citeref{font-size:.72em;line-height:0}
.ds-citeref a{padding:0 2px;text-decoration:none}
.ds-footnotes{margin:0;padding-left:22px;color:var(--ds-ink-2);font-size:14.5px}
.ds-footnotes li{margin:6px 0}
.ds-footnotes li:target{background:var(--ds-accent-tint);border-radius:6px}
.ds-citations{margin:0;padding-left:24px;color:var(--ds-ink-2);font-size:14.5px}
.ds-citations li{margin:10px 0;padding-left:4px}
.ds-citations li:target{background:var(--ds-accent-tint);border-radius:6px}
.ds-cite-main{font-weight:750;color:var(--ds-ink)}
.ds-cite-meta{margin-top:2px;color:var(--ds-ink-3);font-size:13px}
.ds-citations blockquote{margin:8px 0 0;padding:6px 10px;border-left:2px solid var(--ds-line-strong);background:var(--ds-bg-2);border-radius:6px}
.ds-fnback{margin-left:4px;text-decoration:none}

/* charts (inline SVG) */
.ds-chart{border:1px solid var(--ds-line);border-radius:12px;background:var(--ds-bg);padding:14px 12px}
.ds-chart-svg{display:block;width:100%;height:auto}
.ds-chart-label,.ds-chart-tick,.ds-chart-value{font-family:var(--ds-font);font-size:11px}
.ds-chart-label,.ds-chart-tick{fill:var(--ds-ink-3)}
.ds-chart-value{fill:var(--ds-ink-2);font-weight:650;font-variant-numeric:tabular-nums}
.ds-chart-grid{stroke:var(--ds-line);stroke-width:1;stroke-dasharray:2 4}
.ds-chart-axis{stroke:var(--ds-line-2);stroke-width:1.2}
.ds-chart-zero{stroke:var(--ds-line-strong);stroke-width:1.2}

/* provenance receipt */
.ds-receipt{border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg-2);padding:16px 18px;font-size:14px}
.ds-receipt-head{font-weight:680;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ds-ink-3);margin-bottom:12px}
.ds-receipt .ds-detail{grid-template-columns:120px 1fr}
.ds-receipt-sources{margin-top:12px;padding-top:12px;border-top:1px solid var(--ds-line)}
.ds-receipt-sources ul{margin:6px 0 0;padding-left:20px;color:var(--ds-ink-2)}

/* plugin block fallback (Node string renderer injected into the React port) */
.ds-content>.ds-pluginblock{margin-top:34px}
.ds-content>.ds-pluginblock:first-child{margin-top:0}

/* tabs */
.ds-tabbar{display:flex;gap:22px;border-bottom:1px solid var(--ds-line);margin-bottom:20px;overflow-x:auto;overflow-y:hidden;padding-bottom:1px}
.ds-tab{border:0;background:transparent;padding:0 0 11px;color:var(--ds-ink-3);font-size:14px;font-weight:560;border-bottom:1.5px solid transparent;margin-bottom:-1px;cursor:pointer;white-space:nowrap}
.ds-tab.active{color:var(--ds-ink);border-bottom-color:var(--ds-accent)}
.ds-pane{display:none}
.ds-pane.active{display:grid;gap:20px}

/* faq */
details.ds-faq{border-bottom:1px solid var(--ds-line);padding:14px 0}
details.ds-faq summary{cursor:pointer;font-weight:560;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px}
details.ds-faq summary::-webkit-details-marker{display:none}
details.ds-faq summary::after{content:"+";color:var(--ds-ink-3);font-size:18px;flex:none}
details.ds-faq[open] summary::after{content:"-"}
details.ds-faq p{margin:12px 0 2px;color:var(--ds-ink-2)}

/* action items */
.ds-actions{list-style:none;padding:0;margin:0;display:grid}
.ds-action{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 0;border-top:1px solid var(--ds-line)}
.ds-action:first-child{border-top:0}
.ds-action label{display:flex;align-items:center;gap:12px;cursor:pointer;flex:1;min-width:0}
.ds-action input{width:17px;height:17px;accent-color:var(--ds-accent);flex:none}
.ds-action.done .ds-action-title{text-decoration:line-through;color:var(--ds-ink-3)}
.ds-action-meta{display:flex;gap:12px;align-items:center;flex:none}
.ds-owner{font-size:12.5px;color:var(--ds-ink-3)}

/* assumptions */
.ds-assumptions{list-style:none;padding:0;margin:0;display:grid}
.ds-assumption{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:baseline;padding:12px 0;border-top:1px solid var(--ds-line)}
.ds-assumption:first-child{border-top:0}
.ds-akind{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--ds-ink-3)}
.ds-astatus{color:var(--ds-ink-3)}
.ds-assumption.a-verified .ds-astatus{color:var(--ds-ok)}
.ds-assumption.a-rejected .ds-astatus{color:var(--ds-danger)}

/* glossary */
.ds-glossary{display:grid;margin:0}
.ds-gterm{display:grid;grid-template-columns:200px 1fr;gap:24px;padding:13px 0;border-top:1px solid var(--ds-line)}
.ds-gterm:first-child{border-top:0}
.ds-gterm dt{font-weight:560}
.ds-gterm dd{margin:0;color:var(--ds-ink-2)}
.ds-term{border-bottom:1px dotted var(--ds-ink-3);cursor:help}
.ds-xlink{color:var(--ds-accent)}

/* review / triage list */
.ds-reviewboard .ds-review-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:16px 0 13px}
.ds-review-search{flex:1 1 170px;height:36px;border:1px solid var(--ds-line-2);border-radius:9px;background:var(--ds-bg-2);padding:0 12px;font-size:13.5px;outline:0}
.ds-review-search:focus{border-color:var(--ds-line-strong);background:var(--ds-bg)}
.ds-review-only{display:inline-flex;align-items:center;gap:8px;color:var(--ds-ink-2);font-size:13.5px;font-weight:520;cursor:pointer}
.ds-review-only input{width:16px;height:16px;accent-color:var(--ds-accent)}
.ds-review-count{color:var(--ds-ink-2);font-size:13.5px;font-weight:560;font-variant-numeric:tabular-nums}
.ds-btn-line{border:1px solid var(--ds-line-2);background:var(--ds-bg);color:var(--ds-ink-2);height:36px}
.ds-btn-line:hover{border-color:var(--ds-line-strong);background:var(--ds-bg-2);color:var(--ds-ink)}
.ds-rlist{display:grid;gap:9px}
.ds-ritem{border:1px solid var(--ds-line-2);border-radius:12px;background:var(--ds-bg);overflow:hidden;transition:border-color .14s var(--ds-ease)}
.ds-ritem:hover{border-color:var(--ds-line-strong)}
.ds-ritem.selected{border-color:var(--ds-accent)}
.ds-ritem.selected .ds-ritem-head{background:var(--ds-accent-tint)}
.ds-ritem-head{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;padding:15px 17px;cursor:pointer}
.ds-ritem-check{display:flex;align-items:center;padding-top:1px}
.ds-ritem-check input{width:18px;height:18px;accent-color:var(--ds-accent);cursor:pointer}
.ds-ritem-titles{min-width:0}
.ds-row-anchor{display:inline-flex;width:max-content;margin:0 0 5px;padding:2px 7px;border:1px solid var(--ds-line);border-radius:999px;background:var(--ds-bg-2);color:var(--ds-ink-3);font-family:var(--ds-mono);font-size:10.5px;font-weight:650;letter-spacing:.04em;text-decoration:none}
.ds-row-anchor:hover{border-color:var(--ds-line-strong);color:var(--ds-accent);text-decoration:none}
.ds-ritem:target{border-color:var(--ds-accent);box-shadow:0 0 0 3px var(--ds-accent-tint)}
.ds-ritem-titles h4{font-size:15.5px;margin:0 0 3px}
.ds-ritem-titles .ds-muted{margin:0;font-size:14px}
.ds-ritem-aside{display:flex;align-items:center;gap:11px;white-space:nowrap}
.ds-chev{color:var(--ds-ink-3);font-size:12px;transition:transform .22s var(--ds-ease)}
.ds-ritem.open .ds-chev{transform:rotate(180deg)}
.ds-chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}
.ds-chip{padding:3px 10px;border:1px solid var(--ds-line-2);border-radius:999px;color:var(--ds-ink-2);font-size:11px;font-weight:560}
.ds-ritem-wrap{display:grid;grid-template-rows:0fr;transition:grid-template-rows .26s var(--ds-ease)}
.ds-ritem.open .ds-ritem-wrap{grid-template-rows:1fr}
.ds-ritem-body{overflow:hidden;min-height:0;padding:0 17px}
.ds-ref{padding-top:6px;border-top:1px solid var(--ds-line)}
.ds-ref>*{margin-top:15px}
.ds-notes{display:grid;gap:7px;padding:15px 0 17px}
.ds-notes span{color:var(--ds-ink-3);font-size:11.5px;font-weight:680;letter-spacing:.05em;text-transform:uppercase}
.ds-detailgrid{display:grid;margin:0}
.ds-detail{display:grid;grid-template-columns:120px 1fr;gap:16px;padding:8px 0;border-top:1px solid var(--ds-line)}
.ds-detail dt{color:var(--ds-ink-3);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.ds-detail dd{margin:0;color:var(--ds-ink-2);min-width:0;overflow-wrap:anywhere}
textarea{width:100%;min-height:80px;resize:vertical;border:1px solid var(--ds-line-2);border-radius:9px;background:var(--ds-bg);padding:10px 11px;font-size:14px;line-height:1.5;outline:0;overflow:hidden}
textarea:focus{border-color:var(--ds-line-strong)}

/* process boards */
.ds-pitem .ds-ritem-head{grid-template-columns:1fr auto}
.ds-pitem.verdict-approve{border-color:var(--ds-ok)}
.ds-pitem.verdict-approve .ds-ritem-head{background:rgba(18,161,104,.08)}
.ds-pitem.verdict-block{border-color:var(--ds-danger)}
.ds-pitem.verdict-block .ds-ritem-head{background:rgba(214,48,49,.08)}
.ds-pitem.verdict-revise,.ds-pitem.verdict-retry{border-color:var(--ds-warn)}
.ds-pitem.verdict-revise .ds-ritem-head,.ds-pitem.verdict-retry .ds-ritem-head{background:rgba(245,158,11,.09)}
.ds-process-verdict-wrap{display:flex;align-items:center;gap:7px;color:var(--ds-ink-3);font-size:11px;font-weight:680;letter-spacing:.04em;text-transform:uppercase;cursor:default}
.ds-process-verdict{height:32px;border:1px solid var(--ds-line-2);border-radius:8px;background:var(--ds-bg);color:var(--ds-ink);font:inherit;font-size:12px;font-weight:620;letter-spacing:0;text-transform:none;padding:0 26px 0 9px;cursor:pointer}
.ds-process-verdict:focus{outline:2px solid var(--ds-accent-tint);border-color:var(--ds-line-strong)}

.ds-footer{padding:24px 0 calc(24px + env(safe-area-inset-bottom));border-top:1px solid var(--ds-line);color:var(--ds-ink-3);font-size:12.5px}

/* palette + modals */
.ds-palette{position:fixed;inset:0;z-index:70;background:rgba(14,11,22,.42);display:flex;align-items:flex-start;justify-content:center;padding:13vh 16px 16px}
.ds-palette[hidden]{display:none}
.ds-palette-box{width:min(620px,100%);background:var(--ds-bg);border:1px solid var(--ds-line-2);border-radius:16px;box-shadow:0 30px 70px rgba(14,11,22,.3);overflow:hidden}
.ds-palette-input{width:100%;border:0;border-bottom:1px solid var(--ds-line);padding:18px 20px;font-size:16px;background:transparent;outline:0}
.ds-palette-list{max-height:52vh;overflow:auto;-webkit-overflow-scrolling:touch;padding:8px}
.ds-palette-item{display:flex;justify-content:space-between;gap:10px;padding:12px 14px;border-radius:10px;cursor:pointer;font-weight:520;font-size:14.5px}
.ds-palette-item.active{background:var(--ds-bg-2)}
.ds-palette-item small{color:var(--ds-ink-3)}
.ds-modal{position:fixed;inset:0;z-index:70;background:rgba(14,11,22,.42);display:flex;align-items:center;justify-content:center;padding:18px}
.ds-modal[hidden]{display:none}
.ds-modal-box{width:min(820px,100%);max-height:84vh;display:flex;flex-direction:column;background:var(--ds-bg);border:1px solid var(--ds-line-2);border-radius:16px;overflow:hidden;box-shadow:0 30px 70px rgba(14,11,22,.3)}
.ds-modal-head{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--ds-line)}
.ds-modal-box textarea{flex:1;min-height:54vh;border:0;border-radius:0;font-family:var(--ds-mono);font-size:13px}
.ds-shortcuts-box{width:min(520px,100%)}
.ds-shortcuts{display:grid;gap:8px;margin:0;padding:16px}
.ds-shortcuts div{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:12px;border:1px solid var(--ds-line);border-radius:10px;background:var(--ds-bg-2);padding:10px 12px}
.ds-shortcuts dt{display:flex;gap:4px;margin:0}
.ds-shortcuts dd{margin:0;color:var(--ds-ink-2);font-size:13.5px}
.ds-toast{position:fixed;right:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:80;background:var(--ds-ink);color:var(--ds-bg);border-radius:11px;padding:11px 16px;font-size:13.5px;font-weight:560;box-shadow:0 16px 38px rgba(14,11,22,.32);opacity:0;transform:translateY(8px);transition:.18s var(--ds-ease);pointer-events:none}
.ds-toast.show{opacity:1;transform:none}

/* back to top */
.ds-totop{position:fixed;left:18px;bottom:calc(18px + env(safe-area-inset-bottom));z-index:50;display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:50%;border:1px solid var(--ds-line-2);background:var(--ds-bg);color:var(--ds-ink-2);font-size:17px;cursor:pointer;box-shadow:0 10px 28px rgba(20,16,40,.14);opacity:0;transform:translateY(10px) scale(.92);transition:.2s var(--ds-ease);pointer-events:none}
.ds-totop.show{opacity:1;transform:none;pointer-events:auto}
.ds-totop:hover{color:var(--ds-accent);border-color:var(--ds-line-strong)}

/* entrance reveal, JS-added, so no-JS markup stays visible */
.ds-reveal{opacity:0;transform:translateY(12px);transition:opacity .55s var(--ds-ease),transform .55s var(--ds-ease)}
.ds-reveal.in{opacity:1;transform:none}

/* hover lift + link underline + press feedback (pointer devices) */
@media (hover:hover){
  .ds-card,.ds-stat{transition:border-color .14s var(--ds-ease),transform .14s var(--ds-ease)}
  .ds-card:hover,.ds-stat:hover{transform:translateY(-2px);border-color:var(--ds-line-strong)}
  .ds-content a:not(.ds-anchor){background:linear-gradient(currentColor 0 0) 0 100% / 0 1.5px no-repeat;transition:background-size .18s var(--ds-ease)}
  .ds-content a:not(.ds-anchor):hover{background-size:100% 1.5px;text-decoration:none}
}
.ds-btn:active,.ds-menu>summary:active,.ds-toggle:active,.ds-totop:active,.ds-code-copy:active{transform:scale(.96)}

@media (prefers-contrast:more){
  :root{--ds-line:#c5c0d0;--ds-line-2:#aaa3ba;--ds-line-strong:#7d738f;--ds-ink-3:#595164}
  [data-theme="dark"]{--ds-line:#4f475f;--ds-line-2:#665d78;--ds-line-strong:#8c82a0;--ds-ink-3:#cac4d6}
}

/* heading anchors */
.ds-content h2,.ds-content h3{position:relative}
.ds-anchor{margin-left:9px;color:var(--ds-ink-3);font-weight:400;opacity:0;text-decoration:none;transition:opacity .12s var(--ds-ease),color .12s var(--ds-ease)}
.ds-content h2:hover .ds-anchor,.ds-content h3:hover .ds-anchor,.ds-anchor:focus-visible{opacity:1}
.ds-anchor:hover{color:var(--ds-accent)}
tbody tr{transition:color .12s var(--ds-ease)}
tbody tr:hover td{color:var(--ds-ink)}
.ds-action:hover .ds-action-title{color:var(--ds-ink)}

/* ============ responsive ============ */
@media (max-width:1040px){
  .ds-shell{width:calc(100% - 40px)}
  .ds-layout{grid-template-columns:1fr;gap:0;padding-bottom:80px}
  .ds-toc{display:none}
}
@media (max-width:720px){
  .ds-shell{width:calc(100% - 32px)}
  .ds-topbar{height:52px;gap:10px}
  .ds-tools{gap:6px;max-width:calc(100vw - 96px);overflow-x:auto;overscroll-behavior-x:contain;padding-bottom:2px;scrollbar-width:none}
  .ds-tools::-webkit-scrollbar{display:none}
  .ds-search-btn{min-width:0;width:40px;padding:0;justify-content:center}
  .ds-search-btn .ds-search-label,.ds-search-btn kbd{display:none}
  .ds-btn[data-theme-toggle]{width:38px;height:38px}
  .ds-menu-list{right:0;min-width:220px}
  .ds-tool-modal{align-items:flex-start;padding:12px}
  .ds-tool-card{max-height:calc(100vh - 24px);border-radius:12px;padding:14px}
  .ds-tool-head{align-items:flex-start;gap:10px}
  .ds-export-grid{display:grid;grid-template-columns:1fr 1fr}
  .ds-export-grid .ds-btn,.ds-file-btn{width:100%;justify-content:center}
  .ds-tool-row,.ds-field-grid{grid-template-columns:1fr}
  .ds-field-grid .wide{grid-column:auto}
  .ds-hero{padding:24px 0 2px}
  .ds-lede{font-size:16.5px;margin-top:15px}
  .ds-meta{gap:20px}
  .ds-content>.ds-block+.ds-block{margin-top:28px}
  .ds-content>.ds-block+.ds-section{margin-top:40px}
  .ds-section{padding-top:26px}
  .ds-section-body{gap:16px}
  h2{font-size:20px}
  .ds-twocol{grid-template-columns:1fr;gap:18px}
  .ds-phase,.ds-gterm,.ds-detail{grid-template-columns:1fr;gap:5px}
  .ds-timeline::before,.ds-phase::before{display:none}
  .ds-patch-head,.ds-process-card-head,.ds-hunk-head,.ds-diff-file summary{align-items:flex-start;flex-wrap:wrap}
  .ds-ritem-head,.ds-pitem .ds-ritem-head{grid-template-columns:1fr}
  .ds-ritem-aside{white-space:normal;flex-wrap:wrap}
  .ds-codeedit-bar{align-items:flex-start;flex-direction:column}
  .ds-codeedit-meta{justify-content:flex-start}
  .ds-review-search{flex-basis:100%}
  .ds-tablewrap{overflow:visible}
  .ds-tablewrap table{min-width:0;table-layout:auto}
  th,td{padding-right:10px;overflow-wrap:anywhere}
  pre{white-space:pre-wrap;overflow-wrap:anywhere}
  .ds-diff-line{grid-template-columns:28px 28px 16px minmax(0,1fr);min-width:0}
  .ds-diff-line span{padding:0 4px}
  .ds-diff-code{white-space:pre-wrap;overflow-wrap:anywhere}
  .ds-copy{display:none}
}
@media (max-width:480px){
  .ds-shell{width:calc(100% - 24px)}
  .ds-crumbs{font-size:13.5px}
  .ds-hero h1{font-size:27px}
  .ds-lede{font-size:16px}
  .ds-statgrid{grid-template-columns:1fr 1fr}
  .ds-stat strong{font-size:26px}
  .ds-ritem-head{padding:13px 14px;gap:11px}
  .ds-ritem-body{padding:0 14px}
  .ds-palette{padding-top:9vh}
  .ds-shortcuts div{grid-template-columns:1fr;gap:6px}
  .ds-export-grid{grid-template-columns:1fr}
  .ds-blockedit-row{grid-template-columns:1fr 1fr 1fr}
  .ds-blockedit-row b{grid-column:1/-1}
  .ds-flowstep{grid-template-columns:26px 1fr;gap:13px}
  .ds-flow::before{left:12px}
  .ds-flowstep::before{width:26px}
}

/* print / PDF */
@media print{
  @page{size:A4;margin:20mm 14mm 18mm}
  :root{--ds-bg:#fff;--ds-bg-2:#fff;--ds-ink:#111;--ds-ink-2:#333;--ds-ink-3:#666;--ds-line:#ddd;--ds-line-2:#ccc}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html{font-size:11pt}
  body{background:#fff!important;color:#111!important}
  .ds-topbar,.ds-toc,.ds-totop,.ds-palette,.ds-modal,.ds-tool-modal,.ds-toast,.ds-studio,.ds-progress,.ds-skip,.ds-copy,.ds-review-bar,.ds-ritem-check,.ds-notes,.ds-toggle,.ds-code-copy,.ds-codeedit-actions,.ds-diff-files,.ds-process-verdict-wrap,.ds-release-gate textarea{display:none!important}
  .ds-layout{display:block}
  .ds-content{max-width:none}
  .ds-shell{width:100%;background:#fff;box-shadow:none}
  .ds-section[data-collapsed="1"] .ds-section-body{display:grid!important}
  .ds-ritem-wrap{grid-template-rows:1fr!important}
  .ds-section,.ds-block,.ds-hero,.ds-ritem,.ds-card,.ds-stat,.ds-chart,.ds-figure,.ds-codeedit,.ds-patch,.ds-diff-file,.ds-hunk,table,pre{break-inside:avoid-page;box-shadow:none}
  .ds-section,.ds-block{border-color:#ddd}
  .ds-block{margin-block:12pt}
  .ds-hero{padding-top:0}
  .ds-reveal{opacity:1!important;transform:none!important}
  h1,h2,h3,h4{break-after:avoid;orphans:3;widows:3}
  p,li,blockquote{orphans:3;widows:3}
  pre,.ds-diff-line{white-space:pre-wrap;overflow:visible}
  .ds-tablewrap{overflow:visible}
  table{width:100%;page-break-inside:auto}
  tr{break-inside:avoid-page}
  img,svg,.ds-chart-svg{max-width:100%!important;height:auto}
  a{color:inherit;text-decoration:none}
  .ds-content a[href^="http"]::after{content:" (" attr(href) ")";font-size:.86em;color:#666;overflow-wrap:anywhere}
  .ds-content .ds-citeref a::after,.ds-content .ds-fnref a::after{content:""}
}
`;
