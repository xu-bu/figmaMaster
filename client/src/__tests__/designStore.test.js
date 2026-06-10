// ============================================================
// designStore.test.js — real integration test
// ============================================================
// Makes a **real** backend request → real LLM response → verifies
// the store populates correctly and page navigation works.
// ============================================================

import { describe, it, expect, beforeAll } from "vitest";
import { useDesignStore } from "../stores/designStore";

const SIMPLE_PROMPT = "生成一个简单的两页应用: 首页、关于";

beforeAll(() => {
  // Reset data fields to clean state before the real call
  useDesignStore.setState({
    activeTab: "chat",
    activePageIndex: 0,
    currentPages: [],
    currentHtml: null,
    currentTitle: null,
    isGenerating: false,
    error: null,
    messages: [],
    sharedContext: null,
    currentSharedComponents: [],
    dependencies: [],
  });
}, 15_000);

// ----------------------------------------------------------------
// sendPrompt — real LLM, real backend
// ----------------------------------------------------------------
describe("sendPrompt (real backend + real LLM)", () => {
  it(
    "completes generation and populates store with pages",
    async () => {
      // Act: send a real prompt → real backend → real LLM
      await useDesignStore.getState().sendPrompt(SIMPLE_PROMPT);

      // Assert: generation finished
      const state = useDesignStore.getState();
      expect(state.isGenerating).toBe(false);
      expect(state.error).toBeNull();

      // Assert: pages were generated
      expect(state.currentPages.length).toBeGreaterThan(0);
      const page = state.currentPages[0];
      expect(page).toHaveProperty("name");
      expect(page.name).toBeTruthy();
      expect(page).toHaveProperty("html");
      expect(page.html).toBeTruthy();
      expect(page).toHaveProperty("jsx");
      expect(page).toHaveProperty("title");

      // Assert: shared design context is present
      expect(state.sharedContext).toBeTruthy();
      expect(state.sharedContext).toHaveProperty("primaryColor");

      // Assert: preview state is set to the first page
      expect(state.currentHtml).toBeTruthy();
      expect(state.currentTitle).toBeTruthy();

      // Assert: messages were appended (user msg + progress + result)
      expect(state.messages.length).toBeGreaterThanOrEqual(2);
    },
    180_000,
  );

  it(
    "page navigation works with generated pages",
    () => {
      const state = useDesignStore.getState();
      if (state.currentPages.length < 2) return; // skip if only 1 page

      // Switch to page 1 (second page)
      useDesignStore.getState().setActivePage(1);

      const updated = useDesignStore.getState();
      expect(updated.activePageIndex).toBe(1);
      expect(updated.currentHtml).toBe(state.currentPages[1].html);
      expect(updated.currentTitle).toBe(
        state.currentPages[1].title || state.currentPages[1].name,
      );

      // Switch back to page 0
      useDesignStore.getState().setActivePage(0);
      expect(useDesignStore.getState().activePageIndex).toBe(0);
    },
    10_000,
  );
});

// ----------------------------------------------------------------
// setActiveTab — works correctly after real data is loaded
// ----------------------------------------------------------------
describe("tab navigation after generation", () => {
  it(
    "setActiveTab switches between tabs",
    () => {
      useDesignStore.getState().setActiveTab("code");
      expect(useDesignStore.getState().activeTab).toBe("code");

      useDesignStore.getState().setActiveTab("versions");
      expect(useDesignStore.getState().activeTab).toBe("versions");

      useDesignStore.getState().setActiveTab("chat");
      expect(useDesignStore.getState().activeTab).toBe("chat");
    },
    10_000,
  );
});
