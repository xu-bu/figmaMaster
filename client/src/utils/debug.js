// ============================================================
// Debug utility — navigation & state tracing
// ============================================================
// Set DEBUG=true in localStorage to enable verbose logging:
//   localStorage.setItem('DEBUG', 'true')
// Or toggle from the browser console:  __FigmaMaster.debug(true)
//
// All logs go to console.table/console.group so they're easy
// to filter in DevTools.
// ============================================================

const HISTORY_MAX = 200;

/** Circular action log */
const actionHistory = [];

function timestamp() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

function enabled() {
  return typeof window !== "undefined" && window.__FIGMA_DEBUG;
}

// ---- Public API ----

/** Log a navigation-related action */
export function logNav(action, detail = {}) {
  const entry = { t: timestamp(), action, ...detail };
  actionHistory.push(entry);
  if (actionHistory.length > HISTORY_MAX) actionHistory.shift();

  if (enabled()) {
    console.log(
      `%c[NAV]%c ${action} %c${timestamp()}`,
      "color:#a855f7;font-weight:bold",
      "color:inherit",
      "color:#94a3b8;font-size:0.9em",
      detail
    );
  }
}

/** Return a copy of the action history (for tests / console inspection) */
export function getActionHistory() {
  return [...actionHistory];
}

/** Clear the action history */
export function clearActionHistory() {
  actionHistory.length = 0;
}

/** Log a store state change */
export function logStore(prevKeys, nextKeys) {
  if (!enabled()) return;

  const changed = {};
  for (const k of Object.keys(nextKeys)) {
    if (nextKeys[k] !== prevKeys[k]) {
      changed[k] = { from: prevKeys[k], to: nextKeys[k] };
    }
  }
  if (Object.keys(changed).length === 0) return;

  console.groupCollapsed(
    `%c[STORE]%c ${Object.keys(changed).join(", ")}`,
    "color:#3b82f6;font-weight:bold",
    "color:inherit"
  );
  console.table(changed);
  console.groupEnd();
}

/** Log a React render (component name + relevant props/state) */
export function logRender(name, values = {}) {
  if (!enabled()) return;
  console.log(
    `%c[RENDER]%c ${name}`,
    "color:#22c55e;font-weight:bold",
    "color:inherit",
    values
  );
}

/** Log a click event on a navigation element */
export function logClick(source, target, extra = {}) {
  logNav(`click:${source}`, { target, ...extra });
}

/** Toggle debug mode from the console */
function setDebug(on) {
  window.__FIGMA_DEBUG = on;
  console.log(
    `%c[DEBUG]%c FigmaMaster debugging ${on ? "ENABLED" : "DISABLED"}`,
    "color:#ef4444;font-weight:bold",
    "color:inherit"
  );
}

/** Dump the full action history */
function dumpHistory() {
  console.table(actionHistory);
}

/** Dump current store state (requires store reference) */
function dumpState(store) {
  console.table({
    activeTab: store.getState().activeTab,
    activePageIndex: store.getState().activePageIndex,
    currentPages: (store.getState().currentPages || []).map((p) => p.name).join(", ") || "(none)",
    currentTitle: store.getState().currentTitle,
    isGenerating: store.getState().isGenerating,
    error: store.getState().error,
  });
}

// ---- Auto-init from localStorage ----
if (typeof window !== "undefined") {
  window.__FIGMA_DEBUG = localStorage.getItem("FIGMA_DEBUG") === "true";

  Object.defineProperty(window, "__FigmaMaster", {
    value: {
      debug: setDebug,
      history: dumpHistory,
      state: (store) => dumpState(store),
      /** Subscribe to store and log every change */
      watch: (store) => {
        store.subscribe((state, prev) => logStore(prev, state));
        console.log("%c[DEBUG]%c Store watcher attached", "color:#ef4444;font-weight:bold", "color:inherit");
      },
    },
    writable: false,
  });

  if (window.__FIGMA_DEBUG) {
    console.log(
      "%c[DEBUG]%c FigmaMaster debugging active — set __FigmaMaster.debug(false) to disable",
      "color:#ef4444;font-weight:bold;font-size:1.1em",
      "color:inherit"
    );
  }
}
