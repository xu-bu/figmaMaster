// ============================================================
// Babel: JSX → JS transpilation + validation + HTML building
// ============================================================

import { transformSync } from "@babel/core";
import type { GeneratedPage } from "../types.js";

/** Strip import statements referencing known runtime globals (placeholder, navigate, etc.)
 *  The LLM sometimes generates `import { placeholder } from '/utils/placeholder'` despite
 *  prompt instructions — this strips them before transpilation to prevent 404s. */
const RUNTIME_GLOBALS = new Set(["placeholder", "navigate", "getGlobalData", "updateStore"]);
function stripRuntimeImports(jsx: string): string {
  return jsx
    // Strip: import { placeholder } from '...'
    .replace(/import\s*\{[^}]*\b(?:placeholder|navigate|getGlobalData|updateStore)\b[^}]*\}\s*from\s*['"][^'"]*['"]\s*;?\n?/g, '')
    // Strip: import placeholder from '...'
    .replace(/import\s+(?:placeholder|navigate|getGlobalData|updateStore)\s+from\s*['"][^'"]*['"]\s*;?\n?/g, '')
    // Strip: import '...'
    .replace(/import\s+['"][^'"]*(?:placeholder|navigate|getGlobalData|updateStore)[^'"]*['"]\s*;?\n?/g, '');
}

/** Transpile JSX → JS. Throws on invalid JSX (for retry flow). */
export function transpileJSX(jsx: string): string {
  jsx = stripRuntimeImports(jsx);
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

/** Strip "export default function Xxx" -> keep function + add "const App = Xxx" */
function normalizeJS(js: string): string {
  // "export default function Name(" -> "function Name("
  const m = js.match(/export\s+default\s+function\s+(\w+)/);
  if (m) {
    return js.replace(/export\s+default\s+function\s+\w+/, `function ${m[1]}`)
      + `\nconst App = ${m[1]};\n`;
  }
  // "export default Name;" -> "const App = Name;"
  const m2 = js.match(/export\s+default\s+(\w+);?/);
  if (m2) return js.replace(/export\s+default\s+\w+;?/, `const App = ${m2[1]};`);
  // Fallback: try to find component name
  const m3 = js.match(/(?:function|const)\s+(\w+)\s*[=(]/);
  if (m3) return js + `\nconst App = ${m3[1]};\n`;
  return js;
}

/** THE single HTML builder. Takes transpiled JS -> produces valid self-contained HTML. */
export function buildHTML(transpiledJS: string, importMap: Record<string, string>, title: string): string {
  const mapJSON = JSON.stringify({ imports: importMap });
  const normalized = normalizeJS(transpiledJS);
  const renderCode = normalized
    + `\nimport { createRoot } from "react-dom/client";`
    + `\nconst root = createRoot(document.getElementById("root"));`
    + `\nroot.render(React.createElement(App));`;

  // Runtime helpers injected as regular <script> (before module, synchronous).
  // Use var at top level (no IIFE) so these are true globals accessible from module scripts.
  // Also set on window explicitly for environments where var-in-script behavior varies.
  const runtime = [
    'var $navigate=function(p,params){window.parent.postMessage({type:"navigate",page:p,params:params||{}},"*")};',
    'var $updateStore=function(payload){window.parent.postMessage({type:"updateStore",payload:payload},"*")};',
    'var $getGlobalData=function(){return new Promise(function(r){window.parent.postMessage({type:"getStore"},"*");window.addEventListener("message",function h(e){if(e.data&&e.data.type==="storeData"){window.removeEventListener("message",h);r(e.data.data||{})}})})};',
    'var $placeholder=function(w,h,t,bg,fg){var s="<svg xmlns=\\"http://www.w3.org/2000/svg\\" width=\\""+w+"\\" height=\\""+h+"\\"><rect fill=\\""+(bg||"#e2e8f0")+"\\" width=\\""+w+"\\" height=\\""+h+"\\"/><text fill=\\""+(fg||"#94a3b8")+"\\" font-size=\\"16\\" font-family=\\"system-ui\\" text-anchor=\\"middle\\" x=\\""+(w/2)+"\\" y=\\""+(h/2+6)+"\\">"+t+"</text></svg>";return"data:image/svg+xml,"+encodeURIComponent(s)};',
    'window.navigate=$navigate;window.updateStore=$updateStore;window.getGlobalData=$getGlobalData;window.placeholder=$placeholder;',
    'var navigate=$navigate,updateStore=$updateStore,getGlobalData=$getGlobalData,placeholder=$placeholder;',
  ].join('\n');

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

// ============================================================
// Component fragment extraction & merging -- for diff-style refinement
// ============================================================

export interface ComponentFragment {
  name: string;
  code: string;
}

/**
 * Extract top-level component/function definitions from JSX source.
 * Handles patterns generated by the LLM:
 *   - function Name(...) { ... }
 *   - export default function Name(...) { ... }
 *   - const Name = (...) => { ... }
 *   - const Name = function(...) { ... }
 * Uses brace counting to find correct boundaries, supporting nested braces.
 */
export function extractComponentFragments(jsx: string): ComponentFragment[] {
  const fragments: ComponentFragment[] = [];
  const re = /(?:export\s+default\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*(?:=>|function\s*(?:\([^)]*\))?\s*)?)\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = re.exec(jsx)) !== null) {
    const name = match[1] || match[2];
    if (!name) continue;

    const start = match.index;
    // The match already extends to the opening `{` if it ends with `\{`.
    // But for const arrow like `const X = () => {`, the `{` is the last char.
    // Find the exact position of the opening brace.
    let bracePos = match.index + match[0].length - 1;
    // Safety: walk forward from the end of the match to find `{`
    // (handles edge cases where match ends with `=>` not `{`)
    while (bracePos < jsx.length && jsx[bracePos] !== '{') bracePos++;
    if (bracePos >= jsx.length) continue;

    // Count braces to find the matching close
    let depth = 1;
    let end = bracePos + 1;
    while (end < jsx.length && depth > 0) {
      if (jsx[end] === '{') depth++;
      else if (jsx[end] === '}') depth--;
      end++;
    }

    const code = jsx.slice(start, end);
    fragments.push({ name, code });
  }

  return fragments;
}

/**
 * Replace a named component fragment in the original JSX.
 * Uses brace counting to locate the component body in the original source.
 */
export function mergeComponentFragment(originalJsx: string, fragment: ComponentFragment): string {
  // Build patterns to find the start of the definition
  const startPatterns = [
    new RegExp(`export\\s+default\\s+function\\s+${escapeRegex(fragment.name)}`),
    new RegExp(`function\\s+${escapeRegex(fragment.name)}`),
    new RegExp(`const\\s+${escapeRegex(fragment.name)}\\s*=`),
  ];

  for (const pattern of startPatterns) {
    const match = pattern.exec(originalJsx);
    if (!match) continue;

    const start = match.index;
    // Find the opening brace of the function body
    let bracePos = match.index + match[0].length;
    while (bracePos < originalJsx.length && originalJsx[bracePos] !== '{') {
      if (originalJsx[bracePos] === ';') break; // const X = ... => might have no body yet
      bracePos++;
    }
    if (bracePos >= originalJsx.length || originalJsx[bracePos] !== '{') continue;

    // Count braces to find matching close
    let depth = 1;
    let end = bracePos + 1;
    while (end < originalJsx.length && depth > 0) {
      if (originalJsx[end] === '{') depth++;
      else if (originalJsx[end] === '}') depth--;
      end++;
    }

    // Replace: old definition (start -> end) -> new code (fragment.code)
    return originalJsx.slice(0, start) + fragment.code + originalJsx.slice(end);
  }

  // Fallback: check if already identical
  if (originalJsx.includes(fragment.code)) return originalJsx;

  console.warn(`[merge] Could not find component "${fragment.name}" in JSX -- falling back to full replacement`);
  return fragment.code;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Identify which component fragments are relevant to a given instruction.
 * Uses keyword matching: check if the instruction mentions the component name
 * or associated UI elements.
 */
export function identifyRelevantFragments(
  fragments: ComponentFragment[],
  instruction: string
): ComponentFragment[] {
  if (!fragments.length) return [];

  const instr = instruction.toLowerCase();

  // First pass: direct name match
  const named = fragments.filter(f =>
    instr.includes(f.name.toLowerCase())
  );
  if (named.length > 0) return named;

  // Second pass: UI element keyword matching
  const uiKeywords: [string, string[]][] = [
    ['nav', ['nav', 'navbar', 'navigation', 'menu', '导航', '顶部']],
    ['footer', ['footer', '页脚', '版权']],
    ['header', ['header', 'head', '顶部', '标题栏']],
    ['card', ['card', '卡片', 'grid']],
    ['button', ['button', 'btn', '按钮']],
    ['tabbar', ['tab', 'tabbar', '底部导航', 'tab bar']],
    ['banner', ['banner', 'hero', '横幅']],
    ['list', ['list', '列表', 'item']],
    ['search', ['search', '搜索', '查找']],
    ['cart', ['cart', '购物车', '购买']],
    ['product', ['product', '商品', '产品']],
  ];

  for (const [_, keywords] of uiKeywords) {
    if (keywords.some(k => instr.includes(k))) {
      const matched = fragments.filter(f =>
        keywords.some(k => f.name.toLowerCase().includes(k))
      );
      if (matched.length > 0) return matched;
    }
  }

  // Fallback: return ALL fragments (current behavior -- no optimization)
  return fragments;
}
