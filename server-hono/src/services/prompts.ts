import type { DesignPreferences, InteractionPrefs, PageGenTask, SharedContext } from "../types.js";

// ---- Intent ----
const INTENT_SYSTEM = `You are a UI/UX design assistant. Briefly analyze the user's request in 1-2 Chinese sentences. Plain text only.`;
export function intentMsgs(prompt: string) {
  return [
    { role: "system" as const, content: INTENT_SYSTEM },
    { role: "user" as const, content: `Analyze: ${prompt}` },
  ];
}

// ---- Decompose ----
const DECOMPOSE_SYSTEM = `Decompose an app description into pages with a shared design context.
Identify UI elements that should appear on multiple pages (navigation, footer, sidebar, etc.)
Output ONLY JSON:
{
  "sharedContext": {
    "primaryColor": "#3B82F6",
    "colorScheme": "light theme",
    "typography": "system-ui, 16px",
    "navigation": [{"label":"Home","route":"/","pageName":"Home"}],
    "userObject": {},
    "commonStyles": "rounded 8px, card shadows, 24px spacing"
  },
  "sharedComponents": [
    {"name":"NavBar","description":"顶部导航栏，含 logo、菜单项、当前页高亮","props":["currentPage"]},
    {"name":"Footer","description":"页脚，含版权信息和友情链接"}
  ],
  "pages": [
    {"name":"Home","route":"/","description":"Hero + features"}
  ],
  "dependencies": [
    {"name":"react","version":"19.1.0","esmUrl":"https://esm.sh/react@19.1.0"},
    {"name":"react-dom","version":"19.1.0","esmUrl":"https://esm.sh/react-dom@19.1.0"}
  ]
}
3-5 pages max. Only pages explicitly mentioned.
Elements that repeat across pages (nav, footer, header, sidebar) go in sharedComponents.
Each shared component MUST have a unique name and clear description of its role.
IMPORTANT: navigation[].pageName MUST be identical to the page's "name" field in the pages array. The generated code uses navigate(pageName) so exact match is required.`;

export function decomposeMsgs(prompt: string, prefs: DesignPreferences, interactions: InteractionPrefs, conversationSummary?: string, existingPageNames?: string[]) {
  const summaryBlock = conversationSummary
    ? `\n\n## Project History\n${conversationSummary}`
    : '';
  const existingBlock = existingPageNames?.length
    ? `\n\n## Existing Pages (keep these unless user explicitly says to replace them)\n${existingPageNames.join(", ")}`
    : '';
  return [
    { role: "system" as const, content: DECOMPOSE_SYSTEM },
    { role: "user" as const, content: `## App\n${prompt}\n\n## Aesthetic\n${prefs.aesthetic}\n\n## Interaction\n${interactions.interaction}${summaryBlock}${existingBlock}` },
  ];
}

// ---- Page generation (JSX ONLY, no HTML) ----
const PAGE_SYSTEM = `You are an expert React developer. Generate a React JSX component for one page.

Output ONLY valid JSON:
{
  "jsx": "import React...; export default function PageName() { const styles = {...}; return (...); }",
  "title": "Page Title"
}

## Rules
1. JSX component using hooks (useState, useEffect etc.)
2. ALL styles inline as style objects — define them as LOCAL variables INSIDE the component function, NOT at the top level
3. Use the shared context values (colors, nav items, user data shape)
4. Realistic Chinese placeholder content
5. Responsive (mobile + desktop)
6. Component MUST have a default export: "export default function Xxx() { ... }"

## SHARED COMPONENTS (use as-is, do NOT rebuild)
The following shared components are already defined in this scope — use them directly in your JSX. They ensure visual and functional consistency across ALL pages.

{{inject_components}}

Rules:
- Use shared components as-is — DO NOT recreate their JSX or styles
- Pass the required props documented above each component
- Every page MUST use these components in the appropriate positions
- If a component accepts currentPage, always pass it so it can highlight the active page
- Do NOT import these components — they are already part of this file

## RUNTIME API (these functions are injected into window — use them directly, DO NOT import)
- NAVIGATION: call navigate(pageName, params) to go to another page (e.g. navigate('Home', {}) // use pageName from navigation items)
- GLOBAL DATA: call getGlobalData() → Promise<{user, cart, ...}>
- UPDATE STATE: call updateStore(payload) to persist data across pages
- The shared context navigation items tell you which page names are valid for navigate()
- IMAGES: placeholder(w, h, "label") returns an inline SVG data URI. Example: <img src={placeholder(300,200,"商品图")} />

## CODE SIZE — max 250 lines
- NO comments
- NO redundant wrapper divs
- No <a href> — always use navigate() for page transitions
- For images, use placeholder() directly — it's a GLOBAL function, do NOT import it from anywhere
- Never generate HTML — only JSX`;

export function pageMsgs(task: PageGenTask) {
  const ctx = task.sharedContext;
  const nav = (ctx.navigation || []).map(n => `{label:"${n.label}",route:"${n.route}",pageName:"${n.pageName || n.label}"}`).join(", ");

  // Inject shared component JSX code into the system prompt
  let sharedComponentBlock = "No shared components.";
  if (task.sharedComponents?.length) {
    sharedComponentBlock = task.sharedComponents.map(sc => {
      const props = sc.spec.props?.length ? `\n   Props: ${sc.spec.props.join(", ")}` : "";
      let cleanJsx = sc.jsx.replace(/export\s+default\s+/g, "");
      cleanJsx = cleanJsx.replace(/^const\s+styles\s*=/m, `const ${sc.spec.name}_styles =`);
      return `// ${sc.spec.name} — ${sc.spec.description}${props}\n${cleanJsx}`;
    }).join("\n\n");
  }
  const systemContent = PAGE_SYSTEM.replace("{{inject_components}}", sharedComponentBlock);

  return [
    { role: "system" as const, content: systemContent },
    {
      role: "user" as const,
      content: `## Shared Context
- Primary: ${ctx.primaryColor}
- Scheme: ${ctx.colorScheme}
- Typography: ${ctx.typography}
- Nav: [${nav}]
- User: ${JSON.stringify(ctx.userObject)}
- Styles: ${ctx.commonStyles}
- Deps: ${task.dependencies.map(d => d.name).join(", ")}

## Page: ${task.page.name}
Route: ${task.page.route}
Description: ${task.page.description}

## Aesthetic
${task.preferences.aesthetic}

## Interaction
${task.interactions.interaction}

Generate ONLY the JSON with JSX code and title. No HTML.`,
    },
  ];
}

// ---- Shared component generation ----
const COMPONENT_SYSTEM = `You are an expert React developer. Generate a single reusable React component.
Output ONLY valid JSON:
{
  "jsx": "export default function NavBar({ currentPage }) { const styles = {...}; const navItems = [{label:'Home',route:'/',pageName:'Home'}]; return (<nav style={styles.nav}>{navItems.map(item => <button key={item.label} onClick={() => navigate(item.pageName)} style={{...styles.btn, color: currentPage === item.label ? '#333' : '#999'}}>{item.label}</button>)}</nav>); }",
  "title": "Navigation Bar"
}

## Rules
1. Reusable component using hooks if needed
2. ALL styles inline as style objects — define them as LOCAL variables INSIDE the component function, NOT at the top level
3. Use the shared context values (colors, nav items, etc.)
4. Accept props via function parameters for customization
5. Use navigate(pageName) for navigation — NOT <a href>
6. Component MUST have a default export

## RUNTIME API (injected into window — use directly, DO NOT import)
- NAVIGATION: call navigate(pageName, params) to go to another page
- GLOBAL DATA: call getGlobalData() → Promise
- UPDATE STATE: call updateStore(payload)
- IMAGES: placeholder(w, h, "label") returns inline SVG data URI — GLOBAL function, DO NOT import

## CODE SIZE — max 150 lines
- NO comments
- NO <a href> — always use navigate()`;

export function componentMsgs(spec: { name: string; description: string; props?: string[] }, sharedContext: SharedContext) {
  const ctx = sharedContext;
  const nav = (ctx.navigation || []).map(n => `{label:"${n.label}",route:"${n.route}",pageName:"${n.pageName || n.label}"}`).join(", ");
  const propsHint = spec.props?.length ? `\nProps: ${spec.props.join(", ")}` : "";

  return [
    { role: "system" as const, content: COMPONENT_SYSTEM },
    {
      role: "user" as const,
      content: `## Shared Context
- Primary: ${ctx.primaryColor}
- Scheme: ${ctx.colorScheme}
- Typography: ${ctx.typography}
- Nav: [${nav}]
- User: ${JSON.stringify(ctx.userObject)}
- Styles: ${ctx.commonStyles}

## Component: ${spec.name}
Description: ${spec.description}${propsHint}

Generate ONLY the JSON with JSX code. Make it self-contained and reusable.`,
    },
  ];
}

// ---- Fix prompt (retry on Babel error) ----
export function fixMsgs(task: PageGenTask, brokenJSX: string, babelError: string) {
  const ctx = task.sharedContext;
  const nav = (ctx.navigation || []).map(n => `{label:"${n.label}",route:"${n.route}",pageName:"${n.pageName || n.label}"}`).join(", ");

  let sharedComponentBlock = "No shared components.";
  if (task.sharedComponents?.length) {
    sharedComponentBlock = task.sharedComponents.map(sc => {
      let cleanJsx = sc.jsx.replace(/export\s+default\s+/g, "");
      cleanJsx = cleanJsx.replace(/^const\s+styles\s*=/m, `const ${sc.spec.name}_styles =`);
      return `// ${sc.spec.name} — ${sc.spec.description}\n${cleanJsx}`;
    }).join("\n\n");
  }
  const systemContent = PAGE_SYSTEM.replace("{{inject_components}}", sharedComponentBlock);

  return [
    { role: "system" as const, content: systemContent },
    {
      role: "user" as const,
      content: `## Page to Fix: ${task.page.name}
Route: ${task.page.route}
Description: ${task.page.description}
- Primary: ${ctx.primaryColor} | ${ctx.colorScheme}
- Nav: [${nav}] | Styles: ${ctx.commonStyles}
- Aesthetic: ${task.preferences.aesthetic}
- Interaction: ${task.interactions.interaction}

## Broken JSX (caused Babel error below)
\`\`\`jsx
${brokenJSX.slice(0, 2500)}
\`\`\`

## Babel Error
${babelError}

Fix ONLY the syntax error that caused this Babel failure. Keep all functionality, styles, and context unchanged. Return valid JSON with corrected jsx and title.`,
    },
  ];
}

// ---- Fragment-based refine prompt (Strategy 3: send only relevant components to LLM) ----

const REFINE_FRAGMENT_SYSTEM = `You are an expert React developer. You are modifying a specific component within a page.
Output ONLY valid JSON:
{
  "jsx": "function ComponentName() { ... }  // the FULL modified component code",
  "title": "Page Title"
}

## Rules
1. Return ONLY the modified component(s) — not the entire page
2. Keep the same function signature and name
3. ALL styles inline as style objects
4. Use the shared context values consistently
5. Import React at the top if needed
6. Keep the component self-contained

## RUNTIME API (available globally — use directly)
- navigate(pageName, params) — go to another page
- getGlobalData() → Promise<{user, cart, ...}>
- updateStore(payload) — persist data across pages
- placeholder(w, h, "label") — inline SVG data URI for images

Return ONLY valid JSON. No extra text.`;

export function refineFragmentMsgs(
  componentCode: string,
  componentNames: string[],
  instruction: string,
  sharedContext: SharedContext | null,
  conversationSummary?: string,
) {
  const ctx = sharedContext || { primaryColor: "#3B82F6", colorScheme: "light", typography: "system-ui", navigation: [], userObject: {}, commonStyles: "" };
  const nav = (ctx.navigation || []).map(n => `{label:"${n.label}",route:"${n.route}",pageName:"${n.pageName || n.label}"}`).join(", ");

  const summaryBlock = conversationSummary
    ? `\nProject context: ${conversationSummary}`
    : '';

  return [
    { role: "system" as const, content: REFINE_FRAGMENT_SYSTEM },
    {
      role: "user" as const,
      content: `## Shared Context
- Primary: ${ctx.primaryColor} | ${ctx.colorScheme}
- Typography: ${ctx.typography}
- Nav: [${nav}]
- Styles: ${ctx.commonStyles}${summaryBlock}

## Component(s) to Modify: ${componentNames.join(", ")}

\`\`\`jsx
${componentCode}
\`\`\`

## Instruction
${instruction}

Modify the component(s) above according to the instruction. Return ONLY the modified component(s) as valid JSX — function signature and name unchanged. Keep all styles and functionality unless instructed otherwise.`,
    },
  ];
}

// ---- Component identification prompt (Strategy 3: let LLM decide which component to modify) ----

export interface ComponentEntry {
  name: string;
  type: "shared" | "page";
  pageName?: string;
  description: string;
}

const IDENTIFY_SYSTEM = `You are a code analysis assistant. Given a list of available UI components and a user's modification instruction, identify which component(s) need to be modified.

Rules:
- Return ONLY a JSON array of component names, e.g. ["NavBar"] or []
- If the instruction could apply to multiple components, return all that could be relevant
- If nothing matches, return []
- Be precise — only return components that the instruction is DIRECTLY about

Output format: ["ComponentName1", "ComponentName2"]`;

export function identifyComponentMsgs(
  components: ComponentEntry[],
  instruction: string,
) {
  const componentList = components.map(c => {
    const tag = c.type === "shared" ? "SHARED" : `PAGE:${c.pageName || "?"}`;
    return `  - [${tag}] ${c.name} — ${c.description || "no description"}`;
  }).join("\n");

  return [
    { role: "system" as const, content: IDENTIFY_SYSTEM },
    {
      role: "user" as const,
      content: `Available components:\n${componentList}\n\nUser instruction: "${instruction}"\n\nWhich component(s) need modification?`,
    },
  ];
}
