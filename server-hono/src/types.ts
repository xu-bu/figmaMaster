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
}

export interface RefineRequest {
  prompt: string;
  pageName: string;
  currentJsx: string;
  preferences: DesignPreferences;
  interactions: InteractionPrefs;
  sharedContext?: SharedContext;
}

export interface SummarizeRequest {
  messages: { role: string; content: string }[];
}

// ---- Response types ----

export interface StreamEvent {
  event: string;
  data: unknown;
}

// ---- Page generation task for worker pool ----

export interface PageGenTask {
  page: PageTask;
  sharedContext: SharedContext;
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
  dependencies: Dependency[];
  preferences: DesignPreferences;
  interactions: InteractionPrefs;
  createdAt: number;
  updatedAt: number;
}
