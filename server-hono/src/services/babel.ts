// ============================================================
// Babel: JSX → JS transpilation + validation + HTML building
// ============================================================

import { transformSync } from "@babel/core";
import type { GeneratedPage } from "../types.js";

/** Transpile JSX → JS. Throws on invalid JSX (for retry flow). */
export function transpileJSX(jsx: string): string {
  const result = transformSync(jsx, {
    presets: [["@babel/preset-react", { runtime: "automatic" }]],
    filename: "component.jsx",
    comments: false,
  });
  if (!result?.code) throw new Error("Babel produced empty output");
  return result.code;
}

/** Validate + transpile. Returns updated page. Does NOT throw — sets jsValid flag. */
export function validatePage(page: GeneratedPage): GeneratedPage {
  try {
    page.js = transpileJSX(page.jsx);
    page.jsValid = true;
  } catch (err: any) {
    page.js = "";
    page.jsValid = false;
    page.jsError = err.message;
  }
  return page;
}

/** Build import map with trailing-slash prefix mappings */
export function buildImportMap(deps: { name: string; esmUrl: string }[]): Record<string, string> {
  const imp: Record<string, string> = {};
  for (const d of deps) {
    imp[d.name] = d.esmUrl;
    imp[d.name + "/"] = d.esmUrl + "/";
  }
  if (imp["react"]) imp["react/jsx-runtime"] = imp["react"] + "/jsx-runtime";
  return imp;
}

/** Strip "export default function Xxx" → keep function + add "const App = Xxx" */
function normalizeJS(js: string): string {
  // "export default function Name(" → "function Name("
  const m = js.match(/export\s+default\s+function\s+(\w+)/);
  if (m) {
    return js.replace(/export\s+default\s+function\s+\w+/, `function ${m[1]}`)
      + `\nconst App = ${m[1]};\n`;
  }
  // "export default Name;" → "const App = Name;"
  const m2 = js.match(/export\s+default\s+(\w+);?/);
  if (m2) return js.replace(/export\s+default\s+\w+;?/, `const App = ${m2[1]};`);
  // Fallback: try to find component name
  const m3 = js.match(/(?:function|const)\s+(\w+)\s*[=(]/);
  if (m3) return js + `\nconst App = ${m3[1]};\n`;
  return js;
}

/** THE single HTML builder. Takes transpiled JS → produces valid self-contained HTML. */
export function buildHTML(transpiledJS: string, importMap: Record<string, string>, title: string): string {
  const mapJSON = JSON.stringify({ imports: importMap });
  const normalized = normalizeJS(transpiledJS);
  const renderCode = normalized
    + `\nimport { createRoot } from "react-dom/client";`
    + `\nconst root = createRoot(document.getElementById("root"));`
    + `\nroot.render(React.createElement(App));`;

  // Runtime helpers injected as regular script (before module, synchronous execution)
  const runtime = `(function(){
var n=function(p,params){window.parent.postMessage({type:'navigate',page:p,params:params||{}},'*')};
var u=function(payload){window.parent.postMessage({type:'updateStore',payload:payload},'*')};
var g=function(){return new Promise(function(r){window.parent.postMessage({type:'getStore'},'*');window.addEventListener('message',function h(e){if(e.data&&e.data.type==='storeData'){window.removeEventListener('message',h);r(e.data.data||{});}});})};
var p=function(w,h,t,bg,fg){var s='<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"'+w+'\" height=\"'+h+'\"><rect fill=\"'+(bg||'#e2e8f0')+'\" width=\"'+w+'\" height=\"'+h+'\"/><text fill=\"'+(fg||'#94a3b8')+'\" font-size=\"16\" font-family=\"system-ui\" text-anchor=\"middle\" x=\"'+(w/2)+'\" y=\"'+(h/2+6)+'\">'+t+'</text></svg>';return'data:image/svg+xml,'+encodeURIComponent(s);};
Object.defineProperty(window,'navigate',{value:n,configurable:true});
Object.defineProperty(window,'updateStore',{value:u,configurable:true});
Object.defineProperty(window,'getGlobalData',{value:g,configurable:true});
Object.defineProperty(window,'placeholder',{value:p,configurable:true});
})();`;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,sans-serif;}</style>
<script>${runtime}</script>
<script type="importmap">${mapJSON}</script>
</head>
<body>
<div id="root"></div>
<script type="module">
${renderCode}
</script>
</body>
</html>`;
}

function escapeHTML(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
