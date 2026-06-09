// ============================================================
// Zustand Design Store — multi-page generation with SSE streaming
// ============================================================

import { create } from "zustand";

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

const DEFAULT_AESTHETIC =
  "浅色主题，橙色#FF6B35为主色调，圆角卡片，活泼年轻的电商风格。现代无衬线字体，宽松留白，16px 基准间距。";

const DEFAULT_INTERACTION =
  "底部 Tab 导航，页面切换平滑过渡，悬停微动效，Toast 轻提示反馈。";

export const useDesignStore = create((set, get) => ({
  messages: [
    {
      id: "welcome",
      role: "system",
      content:
        "欢迎使用 FigmaMaster！🎨\n\n请描述你想要的**完整应用**，包括有哪些页面。AI 会并行生成所有页面并保持风格一致。\n\n例如：\n- 电商应用：首页、商品列表、购物车\n- 后台系统：仪表盘、订单管理\n\n点击上方 **偏好** 按钮设置审美和交互偏好。",
      timestamp: Date.now(),
    },
  ],
  isGenerating: false,
  error: null,
  sharedContext: null,
  currentPages: [],
  activePageIndex: 0,
  dependencies: [],
  currentHtml: null,
  currentTitle: null,
  preferences: { aesthetic: DEFAULT_AESTHETIC },
  interactions: { interaction: DEFAULT_INTERACTION },
  prefsLocked: false,
  draftAesthetic: DEFAULT_AESTHETIC,
  draftInteraction: DEFAULT_INTERACTION,
  versions: [],
  versionsLoading: false,
  selectedVersions: new Set(),
  // Global shared state (user, cart, etc.) — survives page navigation
  globalStore: { user: null, cart: [], session: {} },

  // Navigate to a page inside the iframe
  navigateToPage: (pageName) => {
    const pages = get().currentPages;
    const idx = pages.findIndex(p => p.name === pageName);
    if (idx >= 0) {
      const page = pages[idx];
      set({ activePageIndex: idx, currentHtml: page.html, currentTitle: page.title || page.name });
    }
  },

  // Update global store from iframe
  updateGlobalStore: (payload) => {
    set(s => ({ globalStore: { ...s.globalStore, ...payload } }));
  },

  activeTab: "chat",
  previewDevice: "desktop",
  showPreferences: false,

  // ---- Preference actions ----
  setDraftAesthetic: (value) => set({ draftAesthetic: value }),
  setDraftInteraction: (value) => set({ draftInteraction: value }),
  applyPreferences: () => {
    const { draftAesthetic, draftInteraction } = get();
    if (!draftAesthetic.trim() || !draftInteraction.trim()) return;
    set({
      preferences: { aesthetic: draftAesthetic.trim() },
      interactions: { interaction: draftInteraction.trim() },
      prefsLocked: true,
    });
  },
  startEditing: () => {
    const { preferences, interactions } = get();
    set({
      draftAesthetic: preferences.aesthetic,
      draftInteraction: interactions.interaction,
      prefsLocked: false,
    });
  },
  setActivePage: (index) => {
    const page = get().currentPages[index];
    if (page) {
      set({ activePageIndex: index, currentHtml: page.html, currentTitle: page.title || page.name });
    }
  },

  // ---- Core: SSE streaming generation ----
  sendPrompt: async (prompt) => {
    const state = get();
    if (!prompt.trim() || state.isGenerating) return;
    if (!state.prefsLocked) get().applyPreferences();

    // Auto-route: cross-page instructions → batch refine all pages
    const crossPageKeywords = /所有页面|每个页面|统一|全站|每一页|都要|加一个|加个|改成|每个|全部页面/;
    if (crossPageKeywords.test(prompt) && state.currentPages.length > 1) {
      return get().refineAllPages(prompt);
    }

    const userMsg = { id: generateId(), role: "user", content: prompt, timestamp: Date.now() };
    const progressMsgId = generateId();
    const progressMsg = { id: progressMsgId, role: "assistant", content: "🔍 正在分析你的需求...", timestamp: Date.now() };

    set({
      messages: [...get().messages, userMsg, progressMsg],
      isGenerating: true, error: null, activeTab: "chat", currentPages: [],
    });

    const updateProgress = (content) => {
      set((s) => ({ messages: s.messages.map((m) => m.id === progressMsgId ? { ...m, content } : m) }));
    };

    try {
      const cs = get();
      // SSE 直连 Hono 后端，绕过 Vite proxy 避免缓冲问题
      const resp = await fetch("http://localhost:3001/api/generate-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, preferences: cs.preferences, interactions: cs.interactions }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", pagesAcc = [], sharedCtx = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            const { event, data } = evt;

            switch (event) {
              case "intent":
                updateProgress(`💡 **理解你的需求**\n\n${data.analysis}\n\n---\n⏳ 拆解页面结构中...`);
                break;

              case "status":
                updateProgress((get().messages.find(m => m.id === progressMsgId)?.content || "") + `\n${data.message}`);
                break;

              case "decompose": {
                sharedCtx = data.sharedContext;
                const names = (data.pages || []).map(p => p.name).join("、");
                updateProgress(
                  `💡 分析完成！\n\n🎨 主色调: **${sharedCtx?.primaryColor || "auto"}**\n📄 共 **${data.pageCount}** 页: ${names}\n\n---\n⏳ 并行生成中...`
                );
                set({
                  sharedContext: sharedCtx,
                  currentPages: (data.pages || []).map(p => ({ name: p.name, route: p.route || "/", jsx: "", js: "", html: "", title: p.name, importMap: {} })),
                });
                break;
              }

              case "page_start":
                updateProgress((get().messages.find(m => m.id === progressMsgId)?.content || "") + `\n🔄 正在生成: **${data.page}**...`);
                break;

              case "page_done":
                pagesAcc = pagesAcc.filter(p => p.name !== data.name);
                pagesAcc.push(data);
                set({ currentPages: [...pagesAcc] });
                if (pagesAcc.length === 1) {
                  set({ currentHtml: pagesAcc[0].html || null, currentTitle: pagesAcc[0].title || pagesAcc[0].name || null });
                }
                updateProgress(
                  (get().messages.find(m => m.id === progressMsgId)?.content || "").replace(
                    `🔄 正在生成: **${data.name}**...`,
                    `✅ **${data.name}** 已完成 (${(data.jsx || "").length} 字符)`
                  )
                );
                break;

              case "page_error":
                updateProgress((get().messages.find(m => m.id === progressMsgId)?.content || "") + `\n❌ **${data.page}** 失败: ${data.error}`);
                break;

              case "complete": {
                const fp = data.pages || pagesAcc;
                updateProgress(
                  `✅ **全部完成！** ${fp.length} 个页面风格一致\n\n` +
                  fp.map(p => `- **${p.name}**: ${(p.jsx || "").length} 字符`).join("\n") +
                  `\n\n点击右侧页签切换预览。`
                );
                set({
                  currentPages: fp, sharedContext: data.sharedContext || sharedCtx,
                  dependencies: data.dependencies || [], isGenerating: false,
                });
                if (fp.length > 0) set({ currentHtml: fp[0].html || null, currentTitle: fp[0].title || fp[0].name || null });
                get().loadVersions();
                break;
              }

              case "error":
                throw new Error(data.message || "生成失败");
            }
          } catch (e) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
    } catch (error) {
      set({ isGenerating: false, error: error.message || "生成失败" });
    }
  },

  // ---- Other actions ----
  setActiveTab: (tab) => set({ activeTab: tab }),
  setPreviewDevice: (device) => set({ previewDevice: device }),

  setShowPreferences: (show) => {
    const state = get();
    if (show && state.prefsLocked) {
      set({
        showPreferences: true, draftAesthetic: state.preferences.aesthetic,
        draftInteraction: state.interactions.interaction, prefsLocked: false,
      });
    } else {
      set({ showPreferences: show });
    }
  },

  restoreVersion: async (versionId) => {
    try {
      const res = await fetch(`/api/versions/${versionId}`).then(r => r.json());
      if (!res.success) throw new Error(res.error?.message || "加载失败");
      const v = res.data;
      const fp = v.pages || [];
      set({
        messages: [...get().messages, { id: generateId(), role: "system", content: `📋 已恢复: **${v.title}**`, timestamp: Date.now() }],
        sharedContext: v.sharedContext || null, currentPages: fp, dependencies: v.dependencies || [],
        activePageIndex: 0, currentHtml: fp[0]?.html || null, currentTitle: fp[0]?.title || null,
      });
    } catch (error) {
      set({ error: error.message });
    }
  },

  loadVersions: async () => {
    set({ versionsLoading: true });
    try {
      const res = await fetch("/api/versions?limit=50").then(r => r.json());
      if (res.success) set({ versions: res.data, versionsLoading: false });
      else set({ versionsLoading: false });
    } catch { set({ versionsLoading: false }); }
  },

  toggleVersionSelect: (id) => {
    set((s) => {
      const next = new Set(s.selectedVersions);
      next.has(id) ? next.delete(id) : next.add(id);
      return { selectedVersions: next };
    });
  },

  selectAllVersions: () => {
    set((s) => {
      if (s.selectedVersions.size === s.versions.length) return { selectedVersions: new Set() };
      return { selectedVersions: new Set(s.versions.map(v => v.id)) };
    });
  },

  deleteVersion: async (id) => {
    await fetch(`/api/versions/${id}`, { method: "DELETE" });
    get().loadVersions();
    set((s) => { const next = new Set(s.selectedVersions); next.delete(id); return { selectedVersions: next }; });
  },

  deleteSelectedVersions: async () => {
    const ids = [...get().selectedVersions];
    if (!ids.length) return;
    await fetch("/api/versions/batch-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    set({ selectedVersions: new Set() });
    get().loadVersions();
  },

  // Batch refine all pages with one instruction
  refineAllPages: async (prompt) => {
    const state = get();
    if (!state.currentPages.length || state.isGenerating) return;

    const userMsg = { id: generateId(), role: "user", content: prompt, timestamp: Date.now() };
    const progressMsgId = generateId();
    set({
      messages: [...get().messages, userMsg, { id: progressMsgId, role: "assistant", content: "🔄 正在统一修改所有页面...", timestamp: Date.now() }],
      isGenerating: true, error: null,
    });

    const updateProgress = (content) => {
      set((s) => ({ messages: s.messages.map(m => m.id === progressMsgId ? { ...m, content } : m) }));
    };

    try {
      const resp = await fetch("http://localhost:3001/api/refine-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          sharedContext: state.sharedContext,
          pages: state.currentPages.map(p => ({ name: p.name, jsx: p.jsx, title: p.title })),
        }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "", pagesAcc = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.event === "page_done") {
              pagesAcc = pagesAcc.filter(p => p.name !== evt.data.name);
              pagesAcc.push(evt.data);
              set({ currentPages: [...pagesAcc] });
              updateProgress(`🔄 ${evt.data.name} 已更新`);
            } else if (evt.event === "complete") {
              const fp = evt.data.pages || pagesAcc;
              set({ currentPages: fp, isGenerating: false });
              if (fp.length > 0) set({ currentHtml: fp[0].html, currentTitle: fp[0].title });
              updateProgress(`✅ 全部 ${fp.length} 个页面已统一修改`);
            }
          } catch {}
        }
      }
    } catch (error) {
      set({ isGenerating: false, error: error.message });
    }
  },

  clearError: () => set({ error: null }),

  resetChat: () => set({
    messages: [{ id: "welcome", role: "system", content: "欢迎使用 FigmaMaster！🎨\n\n描述你想构建的应用，AI 会并行生成所有页面并保持风格一致。\n\n点击上方 **偏好** 按钮设置审美和交互偏好。", timestamp: Date.now() }],
    sharedContext: null, currentPages: [], dependencies: [], activePageIndex: 0,
    currentHtml: null, currentTitle: null, error: null,
  }),
}));
