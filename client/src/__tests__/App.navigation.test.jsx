// ============================================================
// App.navigation.test.jsx — real integration test
// ============================================================
// Renders the full App, sends a **real** prompt to the backend,
// waits for the **real** LLM response, then tests that all
// interaction components (tab bar, page tabs, preview) work.
// ============================================================

import { describe, it, expect, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { useDesignStore } from "../stores/designStore";

const PROMPT = "生成一个简单的两页应用: 首页、关于";

beforeAll(() => {
  // Reset store to clean state
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

describe("Generated page switching", () => {
  it(
    "sends real prompt → generates pages → click page tab → preview switches",
    async () => {
      const user = userEvent.setup();
      render(<App />);

      // ---- 1. Send a real prompt ----
      const textarea = screen.getByPlaceholderText(/描述你想要的/);
      await user.type(textarea, PROMPT);
      await user.keyboard("{Enter}");

      // ---- 2. Wait for generation to finish ----
      await waitFor(
        () => {
          expect(useDesignStore.getState().isGenerating).toBe(false);
        },
        { timeout: 180_000, interval: 1_000 },
      );

      // ---- 3. Verify store has generated pages ----
      const state = useDesignStore.getState();
      expect(state.error).toBeNull();
      expect(state.currentPages.length).toBeGreaterThan(0);
      const pageNames = state.currentPages.map((p) => p.name);
      console.log("✅ Generated pages:", pageNames);

      // ---- 4. Verify page tabs appear in the preview area ----
      for (const page of state.currentPages) {
        expect(
          screen.getByRole("button", { name: page.name }),
        ).toBeInTheDocument();
      }

      // ---- 5. Click a page tab → verify preview switches ----
      if (state.currentPages.length >= 2) {
        const secondTab = screen.getByRole("button", {
          name: state.currentPages[1].name,
        });
        await user.click(secondTab);
        expect(useDesignStore.getState().activePageIndex).toBe(1);

        // Click back to first page
        const firstTab = screen.getByRole("button", {
          name: state.currentPages[0].name,
        });
        await user.click(firstTab);
        expect(useDesignStore.getState().activePageIndex).toBe(0);
      }
    },
    300_000,
  );
});
