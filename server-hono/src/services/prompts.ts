import type { DesignPreferences, InteractionPrefs, PageGenTask } from "../types.js";

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
Output ONLY JSON:
{
  "sharedContext": {
    "primaryColor": "#3B82F6",
    "colorScheme": "light theme",
    "typography": "system-ui, 16px",
    "navigation": [{"label":"Home","route":"/"}],
    "userObject": {},
    "commonStyles": "rounded 8px, card shadows, 24px spacing"
  },
  "pages": [
    {"name":"Home","route":"/","description":"Hero + features"}
  ],
  "dependencies": [
    {"name":"react","version":"19.1.0","esmUrl":"https://esm.sh/react@19.1.0"},
    {"name":"react-dom","version":"19.1.0","esmUrl":"https://esm.sh/react-dom@19.1.0"}
  ]
}
3-5 pages max. Only pages explicitly mentioned.`;

export function decomposeMsgs(prompt: string, prefs: DesignPreferences, interactions: InteractionPrefs) {
  return [
    { role: "system" as const, content: DECOMPOSE_SYSTEM },
    { role: "user" as const, content: `## App\n${prompt}\n\n## Aesthetic\n${prefs.aesthetic}\n\n## Interaction\n${interactions.interaction}` },
  ];
}

// ---- Page generation (JSX ONLY, no HTML) ----
const PAGE_SYSTEM = `You are an expert React developer. Generate a React JSX component for one page.

Output ONLY valid JSON:
{
  "jsx": "import React...; const styles = {...}; export default function PageName() { ... }",
  "title": "Page Title"
}

## Rules
1. JSX component using hooks (useState, useEffect etc.)
2. ALL styles inline as style objects (const styles = {...}) — NO CSS files, NO <style> tags
3. Use the shared context values (colors, nav items, user data shape)
4. Realistic Chinese placeholder content
5. Responsive (mobile + desktop)
6. Component MUST have a default export: "export default function Xxx() { ... }"

## CRITICAL — Navigation Bar (MANDATORY)
- EVERY page MUST include a navigation bar as the FIRST element after the container div
- The nav bar should show ALL navigation items from the shared context
- Highlight the CURRENT page in the nav (active state)
- Use window.navigate() for nav clicks — NOT <a href>
- Example nav structure:
  <div style={styles.nav}>
    {navItems.map(item => (
      <button key={item.label} onClick={() => navigate(item.route === '/' ? 'home' : item.route)}
        style={{...styles.navBtn, color: isCurrentPage ? primaryColor : '#999'}}>
        {item.label}
      </button>
    ))}
  </div>
- This is NON-NEGOTIABLE. Every page must have it. Consistency across pages is the #1 priority.

## RUNTIME API (these functions are injected into window — use them directly)
- NAVIGATION: call window.navigate(pageName, params) to go to another page
  Example: <button onClick={() => navigate('product', { id: 1 })}>查看</button>
  Do NOT use <a href="..."> or React Router — always use navigate()
- GLOBAL DATA: call window.getGlobalData() → returns Promise<{user, cart, ...}>
  Example: const data = await getGlobalData(); setUser(data.user);
- UPDATE STATE: call window.updateStore(payload) to persist data across pages
  Example: updateStore({ cart: [...cart, newItem] });
  This ensures cart data survives when user navigates between pages.
- The shared context navigation items tell you which page names are valid for navigate()

## CODE SIZE — max 250 lines
- NO comments
- NO redundant wrapper divs
- No <a href> — always use navigate() for page transitions
- For images, use window.placeholder(width, height, "label") — returns an inline SVG data URI that never fails. Example: <img src={placeholder(300,200,"商品图")} /> or <img src={placeholder(80,80,"头像","#dbeafe","#2563eb")} />
- Never generate HTML — only JSX`;

export function pageMsgs(task: PageGenTask) {
  const ctx = task.sharedContext;
  const nav = (ctx.navigation || []).map(n => `{label:"${n.label}",route:"${n.route}"}`).join(", ");

  return [
    { role: "system" as const, content: PAGE_SYSTEM },
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

// ---- Fix prompt (retry on Babel error) ----
export function fixMsgs(task: PageGenTask, brokenJSX: string, babelError: string) {
  const ctx = task.sharedContext;
  const nav = (ctx.navigation || []).map(n => `{label:"${n.label}",route:"${n.route}"}`).join(", ");
  return [
    { role: "system" as const, content: PAGE_SYSTEM },
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
