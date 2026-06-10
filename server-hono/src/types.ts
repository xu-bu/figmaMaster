// ============================================================
// Core types for FigmaMaster Hono Server
// ============================================================

export interface SharedContext {
  primaryColor: string;
  colorScheme: string;
  typography: string;
  navigation: NavItem[];
  userObject: Record<string, unknown>;
  commonStyles: string;
}

export interface NavItem {
  label: string;
  route: string;
  /** Page name that navigate() should use (matches PageTask.name) */
  pageName: string;
}

export interface PageTask {
  name: string;
  route: string;
  description: string;
}

export interface Dependency {
  name: string;
  version: string;
  esmUrl: string;
}

export interface DecomposeResult {
  sharedContext: SharedContext;
  sharedComponents?: SharedComponentSpec[];
  pages: PageTask[];
  dependencies: Dependency[];
}

export interface GeneratedPage {
  name: string;
  route: string;
  jsx: string;
  js: string;
  html: string;
  title: string;
  importMap: Record<string, string>;
  /** Whether Babel transpilation succeeded */
  jsValid: boolean;
  /** Error message if JSX was invalid */
  jsError?: string;
}

// ---- Request types ----

export interface DesignPreferences {
  aesthetic: string;
}

export interface InteractionPrefs {
  interaction: string;
}

export interface GenerateRequest {
  prompt: string;
  preferences: DesignPreferences;
  interactions: InteractionPrefs;
  /** Optional conversation summary — compressed from earlier turns, injected as project context */
  conversationSummary?: string;
  /** Names of existing pages — helps LLM decide to add/modify vs replace */
  existingPageNames?: string[];
}

export interface RefineRequest {
  prompt: string;
  pageName: string;
  currentJsx?: string;          // empty or omitted = new page generation
  preferences: DesignPreferences;
  interactions: InteractionPrefs;
  sharedContext?: SharedContext;
  existingPages?: { name: string; route: string }[];  // context for new page
  /** Optional conversation summary */
  conversationSummary?: string;
  /** Fragment mode: only send relevant components to LLM, merge response back */
  fragmentMode?: boolean;
}

export interface SummarizeRequest {
  messages: { role: string; content: string }[];
}

// ---- Response types ----

export interface StreamEvent {
  event: string;
  data: unknown;
}

// ---- Shared Components ----

export interface SharedComponentSpec {
  name: string;
  description: string;
  /** Optional props this component accepts (e.g. ["currentPage", "items"]) */
  props?: string[];
}

export interface SharedComponent {
  spec: SharedComponentSpec;
  jsx: string;
}

// ---- Page generation task ----

export interface PageGenTask {
  page: PageTask;
  sharedContext: SharedContext;
  sharedComponents?: SharedComponent[];
  preferences: DesignPreferences;
  interactions: InteractionPrefs;
  dependencies: Dependency[];
}

export interface PageGenResult {
  page: GeneratedPage;
  error?: Error;
}

// ---- Version ----

export interface Version {
  id: string;
  title: string;
  description: string;
  prompt: string;
  pages: GeneratedPage[];
  sharedContext: SharedContext;
  sharedComponents?: SharedComponent[];
  dependencies: Dependency[];
  preferences: DesignPreferences;
  interactions: InteractionPrefs;
  createdAt: number;
  updatedAt: number;
}
