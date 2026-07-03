// Live-only runtime injected by `dossier serve`.
// It is intentionally kept out of generated artifacts unless a local server is running.

import { CODEMIRROR_BOOTSTRAP_PATH, CODEMIRROR_IMPORT_MAP } from "./live-codemirror.mjs";

export const LIVE = `<style>
.ds-host-editor{border-top:1px solid var(--ds-line);background:var(--ds-bg)}
.ds-host-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--ds-line);background:var(--ds-bg-2)}
.ds-host-tools input{min-width:150px;border:1px solid var(--ds-line-2);border-radius:7px;background:var(--ds-bg);color:var(--ds-ink);padding:6px 8px;font:12px var(--ds-font)}
.ds-host-engine{margin-right:auto;color:var(--ds-ink-3);font:12px var(--ds-mono)}
.ds-host-row{display:grid;grid-template-columns:minmax(42px,max-content) minmax(0,1fr);min-height:220px}
.ds-host-lines{padding:14px 8px;border-right:1px solid var(--ds-line);background:var(--ds-bg-2);color:var(--ds-ink-3);font:12px/1.55 var(--ds-mono);text-align:right;user-select:none;white-space:pre}
.ds-host-row .ds-codeedit-area{min-height:220px}
.ds-host-wrap .ds-codeedit-area{white-space:pre-wrap}
.ds-host-codemirror .ds-host-row{display:block}
.ds-host-codemirror .ds-host-lines,.ds-host-codemirror .ds-codeedit-area{display:none}
.ds-cm{min-width:0}
.ds-cm .cm-editor{border:0;background:var(--ds-bg);color:var(--ds-ink)}
.ds-cm .cm-scroller{min-height:220px;max-height:72vh}
.ds-cm .cm-line{padding-left:12px;padding-right:12px}
.ds-host-wrap .ds-cm .cm-line{white-space:pre-wrap}
.ds-live-model{position:fixed;inset:0;z-index:90;background:rgba(15,14,20,.38);display:flex;align-items:center;justify-content:center;padding:24px}
.ds-live-model[hidden]{display:none}
.ds-live-card{width:min(980px,100%);max-height:88vh;display:grid;grid-template-rows:auto 1fr auto;background:var(--ds-bg);border:1px solid var(--ds-line-2);border-radius:14px;box-shadow:0 24px 80px rgba(0,0,0,.22);overflow:hidden}
.ds-live-head,.ds-live-foot{display:flex;align-items:center;gap:8px;padding:12px 14px;background:var(--ds-bg-2);border-bottom:1px solid var(--ds-line)}
.ds-live-foot{border-top:1px solid var(--ds-line);border-bottom:0;justify-content:flex-end}
.ds-live-head h3{margin:0 auto 0 0;font-size:15px}
.ds-live-body{display:grid;grid-template-columns:minmax(220px,300px) 1fr;min-height:420px;overflow:hidden}
.ds-live-blocks{border-right:1px solid var(--ds-line);padding:12px;overflow:auto}
.ds-live-block{display:grid;grid-template-columns:1fr auto auto auto;gap:4px;align-items:center;border:1px solid var(--ds-line-2);border-radius:8px;padding:7px 8px;margin-bottom:7px;background:var(--ds-bg)}
.ds-live-block b{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ds-live-block small{display:block;color:var(--ds-ink-3);font-weight:500}
.ds-live-add{display:grid;grid-template-columns:1fr;gap:7px;margin-top:12px}
.ds-live-add input,.ds-live-add select{border:1px solid var(--ds-line-2);border-radius:7px;background:var(--ds-bg);color:var(--ds-ink);padding:7px 8px}
.ds-live-json{display:grid;grid-template-rows:1fr auto;min-width:0}
.ds-live-json textarea{width:100%;height:100%;min-height:420px;border:0;padding:14px 16px;background:var(--ds-bg);color:var(--ds-ink);font:12.5px/1.55 var(--ds-mono);resize:none}
.ds-live-status{padding:8px 12px;border-top:1px solid var(--ds-line);color:var(--ds-ink-3);font-size:12px}
@media(max-width:760px){.ds-live-body{grid-template-columns:1fr}.ds-live-blocks{border-right:0;border-bottom:1px solid var(--ds-line);max-height:260px}.ds-live-model{padding:10px}}
	</style><script type="importmap">${CODEMIRROR_IMPORT_MAP}</script><script type="module" src="${CODEMIRROR_BOOTSTRAP_PATH}"></script><script>
	window.__DOSSIER_SAVE_TOKEN__="__DOSSIER_SAVE_TOKEN__";
	try{new EventSource('/__reload').onmessage=function(){location.reload()}}catch(e){}
(function(){
  function $(s,r){return (r||document).querySelector(s)}
  function $$(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s))}
	  function post(url,payload){return fetch(url,{method:"POST",headers:{"Content-Type":"application/json","X-Dossier-Token":window.__DOSSIER_SAVE_TOKEN__||""},body:JSON.stringify(payload)}).then(function(r){if(!r.ok)return r.text().then(function(t){throw new Error(t||"request failed")});return r.json();});}
  function toast(msg){var t=$("[data-toast]");if(!t)return; t.textContent=msg;t.classList.add("show");setTimeout(function(){t.classList.remove("show")},1800);}
  function btn(label,cls){var b=document.createElement("button");b.className=cls||"ds-btn ds-btn-line";b.type="button";b.textContent=label;return b;}
  function editorHost(ta){return ta&&ta.closest("[data-host-editor]");}
  function editorText(ta){var host=editorHost(ta);return host&&typeof host.__editorGetText==="function"?host.__editorGetText():ta.value;}
  function setEditorText(ta,text){var host=editorHost(ta);if(host&&typeof host.__editorSetText==="function")host.__editorSetText(text);else{ta.value=String(text||"");ta.dispatchEvent(new Event("input",{bubbles:true}));}}
  function editorPayload(ta){return {id:ta.getAttribute("data-code-editor"),text:editorText(ta),targetPath:ta.getAttribute("data-editor-target"),filename:ta.getAttribute("data-editor-filename"),title:ta.getAttribute("data-editor-title")};}
  function saveEditor(ta){return post("/__save-editor",editorPayload(ta)).then(function(){toast("Saved to dossier JSON")}).catch(function(e){toast("Save failed");console.error(e);});}
  function countLines(text){return Math.max(1,String(text||"").split("\\n").length);}
  function editorCtx(ta){return {id:ta.getAttribute("data-code-editor"),textarea:ta,language:ta.getAttribute("data-editor-lang")||"",filename:ta.getAttribute("data-editor-filename")||"",targetPath:ta.getAttribute("data-editor-target")||"",title:ta.getAttribute("data-editor-title")||""};}
  function enhanceEditor(ctx){
    var ta=ctx&&ctx.textarea;if(!ta||ta.getAttribute("data-live-enhanced"))return;
    ta.setAttribute("data-live-enhanced","1");
    var shell=ta.closest("[data-editor-shell]")||ta.parentNode;
    var host=document.createElement("div");host.className="ds-host-editor";host.setAttribute("data-host-editor",ctx.id||"");
    var tools=document.createElement("div");tools.className="ds-host-tools";
    var engine=document.createElement("span");engine.className="ds-host-engine";engine.textContent=(window.DossierCodeMirrorEnhancer?"CodeMirror 6":"Textarea host adapter")+" · "+(ctx.language||"text");
    var search=document.createElement("input");search.type="search";search.placeholder="Find in editor";
    var wrap=btn("Wrap");var fmt=btn("Format JSON");var copy=btn("Copy");var save=btn("Save to dossier");
    tools.appendChild(engine);tools.appendChild(search);tools.appendChild(wrap);tools.appendChild(fmt);tools.appendChild(copy);tools.appendChild(save);
    var row=document.createElement("div");row.className="ds-host-row";
    var lines=document.createElement("div");lines.className="ds-host-lines";
    ta.parentNode.insertBefore(host,ta);host.appendChild(tools);host.appendChild(row);row.appendChild(lines);row.appendChild(ta);
    host.__saveEditor=function(){return saveEditor(ta);};
    function refreshLines(){var n=countLines(ta.value),out=[];for(var i=1;i<=n;i++)out.push(i);lines.textContent=out.join("\\n");}
    function markFind(){var q=search.value;if(!q)return;var cm=host.__editorFind;if(typeof cm==="function"){cm(q);return;}var i=ta.value.toLowerCase().indexOf(q.toLowerCase());if(i>=0){ta.focus();ta.setSelectionRange(i,i+q.length);}}
    ta.addEventListener("input",refreshLines);ta.addEventListener("scroll",function(){lines.scrollTop=ta.scrollTop;});
    ta.addEventListener("keydown",function(e){if(e.key==="Tab"){e.preventDefault();var s=ta.selectionStart,en=ta.selectionEnd;ta.value=ta.value.slice(0,s)+"  "+ta.value.slice(en);ta.selectionStart=ta.selectionEnd=s+2;ta.dispatchEvent(new Event("input",{bubbles:true}));}else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="s"){e.preventDefault();saveEditor(ta);}});
    search.addEventListener("input",markFind);wrap.addEventListener("click",function(){var wrapped=host.classList.toggle("ds-host-wrap");if(typeof host.__editorSetWrap==="function")host.__editorSetWrap(wrapped);});fmt.addEventListener("click",function(){try{setEditorText(ta,JSON.stringify(JSON.parse(editorText(ta)),null,2));toast("Formatted JSON");}catch(e){toast("Not valid JSON");}});copy.addEventListener("click",function(){navigator.clipboard&&navigator.clipboard.writeText(editorText(ta)).then(function(){toast("Editor text copied")});});save.addEventListener("click",function(){saveEditor(ta);});
    refreshLines();
    if(typeof window.DossierCodeMirrorEnhancer==="function")window.DossierCodeMirrorEnhancer(ctx);
  }
  window.DossierEditorEnhancer=enhanceEditor;
  window.addEventListener("dossier:codemirror-ready",function(){$$("[data-code-editor]").forEach(function(ta){var host=editorHost(ta);if(host&&typeof window.DossierCodeMirrorEnhancer==="function")window.DossierCodeMirrorEnhancer(editorCtx(ta));});});
  $$("[data-code-editor]").forEach(function(ta){enhanceEditor(editorCtx(ta));});

  var tools=$(".ds-tools");
  if(tools&&!tools.querySelector("[data-live-patch-import]")){
    var p=btn("Import patch","ds-btn");p.setAttribute("data-live-patch-import","");
    p.addEventListener("click",function(){var input=document.createElement("input");input.type="file";input.accept=".json,.diff,.patch,text/plain,application/json";input.onchange=function(){var f=input.files[0];if(!f)return;var r=new FileReader();r.onload=function(){var text=String(r.result||""),payload;try{payload=JSON.parse(text)}catch(e){payload={type:"patch-set",title:"Imported patch",patches:[{id:"imported-patch",title:f.name||"Imported patch",operation:"mixed",status:"proposed",risk:"medium",diff:text}]}}post("/__append-patchset",payload).then(function(){toast("Patch set imported")}).catch(function(e){toast("Patch import failed");console.error(e);});};r.readAsText(f);};input.click();});
    tools.appendChild(p);
  }

  if(tools&&!tools.querySelector("[data-live-model-open]")){
    var open=btn("Model editor","ds-btn ds-btn-line");open.setAttribute("data-live-model-open","");
    var panel=document.createElement("div");panel.className="ds-live-model";panel.hidden=true;
    panel.innerHTML='<div class="ds-live-card"><div class="ds-live-head"><h3>Model editor</h3><button class="ds-btn ds-btn-line" type="button" data-live-format>Format</button><button class="ds-btn ds-btn-line" type="button" data-live-close>Close</button></div><div class="ds-live-body"><div class="ds-live-blocks"><div data-live-block-list></div><div class="ds-live-add"><select data-live-type><option>prose</option><option>section</option><option>callout</option><option>table</option><option>code-editor</option><option>process-board</option><option>patch-set</option><option>verification-run</option><option>release-checklist</option></select><input data-live-title placeholder="New block title"><button class="ds-btn" type="button" data-live-add>Add block</button></div></div><div class="ds-live-json"><textarea spellcheck="false" data-live-json></textarea><div class="ds-live-status" data-live-status>Ready</div></div></div><div class="ds-live-foot"><button class="ds-btn ds-btn-line" type="button" data-live-validate>Validate</button><button class="ds-btn" type="button" data-live-save>Save model</button></div></div>';
    document.body.appendChild(panel);tools.appendChild(open);
    var ta=$("[data-live-json]",panel),list=$("[data-live-block-list]",panel),status=$("[data-live-status]",panel);
    function current(){return JSON.parse(ta.value);}
    function setModel(m){ta.value=JSON.stringify(m,null,2);renderBlocks(m);}
    function blockTitle(b,i){return (b.title||b.heading||b.type||"block")+" · "+(b.id||("index "+i));}
    function emptyBlock(type,title){var b={type:type,title:title||type};if(type==="prose"){delete b.title;b.markdown=title||"New prose block.";}else if(type==="section"){b.blocks=[];}else if(type==="callout"){b.body=title||"New callout.";}else if(type==="table"){b.columns=["Column"];b.rows=[["Value"]];}else if(type==="code-editor"){b.code="";b.lang="text";}else if(type==="process-board"){b.items=[{id:"new-work-item",title:title||"New work item"}];}else if(type==="patch-set"){b.patches=[{id:"new-patch",title:title||"New patch"}];}else if(type==="verification-run"){b.runs=[{id:"new-run",title:title||"New run"}];}else if(type==="release-checklist"){b.gates=[{id:"new-gate",title:title||"New gate",required:true,status:"todo"}];}return b;}
    function renderBlocks(m){list.innerHTML="";(m.blocks||[]).forEach(function(b,i){var row=document.createElement("div");row.className="ds-live-block";var label=document.createElement("b");label.textContent=blockTitle(b,i);var up=btn("↑");var down=btn("↓");var del=btn("Delete");row.appendChild(label);row.appendChild(up);row.appendChild(down);row.appendChild(del);up.disabled=i===0;down.disabled=i===(m.blocks||[]).length-1;up.addEventListener("click",function(){var x=m.blocks[i-1];m.blocks[i-1]=m.blocks[i];m.blocks[i]=x;setModel(m);});down.addEventListener("click",function(){var x=m.blocks[i+1];m.blocks[i+1]=m.blocks[i];m.blocks[i]=x;setModel(m);});del.addEventListener("click",function(){m.blocks.splice(i,1);setModel(m);});list.appendChild(row);});}
    function validateOnly(){try{var m=current();status.textContent="Valid JSON · "+((m.blocks||[]).length)+" top-level blocks";return m;}catch(e){status.textContent="Invalid JSON: "+e.message;return null;}}
    open.addEventListener("click",function(){setModel(window.__DOSSIER_MODEL__||JSON.parse(document.querySelector("#dossier-model").textContent));panel.hidden=false;});
    $("[data-live-close]",panel).addEventListener("click",function(){panel.hidden=true;});
    $("[data-live-format]",panel).addEventListener("click",function(){var m=validateOnly();if(m)setModel(m);});
    $("[data-live-validate]",panel).addEventListener("click",validateOnly);
    $("[data-live-add]",panel).addEventListener("click",function(){var m=validateOnly();if(!m)return;m.blocks=Array.isArray(m.blocks)?m.blocks:[];m.blocks.push(emptyBlock($("[data-live-type]",panel).value,$("[data-live-title]",panel).value));setModel(m);});
    $("[data-live-save]",panel).addEventListener("click",function(){var m=validateOnly();if(!m)return;post("/__save-model",{model:m}).then(function(){window.__DOSSIER_MODEL__=m;status.textContent="Saved, waiting for reload";toast("Model saved");}).catch(function(e){status.textContent="Save failed: "+e.message;toast("Model save failed");});});
  }
})();
</script>`;
