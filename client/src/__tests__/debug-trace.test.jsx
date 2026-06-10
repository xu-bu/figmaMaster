// ============================================================
// debug-trace.test.js — use debug tool to trace tab navigation
// ============================================================
// This test exercises the exact user flow:
//   1. Render the App
//   2. Click a tab button
//   3. Read the debug action history to see if click was captured
//   4. Check the store state to see if it updated
//   5. Check the DOM to see if the panel switched
//
// If ANY step fails we know exactly where the chain breaks.
// ============================================================

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { useDesignStore } from "../stores/designStore";
import { getActionHistory, clearActionHistory } from "../utils/debug";

const SAMPLE = {
  name: "Products",
  route: "/products",
  title: "产品页",
  html: "<h1>Products</h1>",
  js: "",
  jsx: "",
  importMap: {},
};

beforeEach(() => {
  // Reset store to clean state
  useDesignStore.setState({
    activeTab: "chat",
    activePageIndex: 0,
    currentPages: [],
    currentHtml: null,
    currentTitle: null,
    isGenerating: false,
    error: null,
  });
  clearActionHistory();
});

// ----------------------------------------------------------------
// TDD: Reproduction test for the actual user bug
// LLM-generated nav calls navigate("products") but page is
// named "Products". The SYSTEMIC fix is case-insensitive matching
// in navigateToPage — not a prompt tweak.
//
// STEP 1: Write test for desired behavior (case-insensitive match)
//          → SHOULD FAIL with exact-match-only code
// STEP 2: Apply case-insensitive fix
//          → test now PASSES
// ----------------------------------------------------------------
describe("navigateToPage — case-insensitive matching (TDD)", () => {
  it("lowercase 'products' matches page 'Products'", () => {
    useDesignStore.setState({
      currentPages: [
        { ...SAMPLE, name: "Home", route: "/", html: "<h1>Home</h1>" },
        { ...SAMPLE, name: "About", route: "/about", html: "<h1>About</h1>" },
        { ...SAMPLE, name: "Products", route: "/products", html: "<h1>Products</h1>" },
      ],
      currentHtml: "<h1>Home</h1>",
    });

    // This is the EXACT call from the user's debug log
    // It should find the page regardless of case
    useDesignStore.getState().navigateToPage("products");

    const state = useDesignStore.getState();
    expect(state.activePageIndex).toBe(2);
    expect(state.currentHtml).toBe("<h1>Products</h1>");
    expect(state.currentTitle).toBe("产品页");
    console.log("[DEBUG] ✓ 'products' found page 'Products' (case-insensitive)");
  });

  it("exact match still works", () => {
    useDesignStore.setState({
      currentPages: [
        { ...SAMPLE, name: "Home", route: "/", html: "<h1>Home</h1>" },
        { ...SAMPLE, name: "Products", route: "/products", html: "<h1>Products</h1>" },
      ],
      currentHtml: "<h1>Home</h1>",
    });

    useDesignStore.getState().navigateToPage("Products");
    expect(useDesignStore.getState().activePageIndex).toBe(1);
  });

  it("unknown page still logs not-found", () => {
    useDesignStore.setState({
      currentPages: [
        { ...SAMPLE, name: "Home", route: "/", html: "<h1>Home</h1>" },
        { ...SAMPLE, name: "Products", route: "/products", html: "<h1>Products</h1>" },
      ],
      currentHtml: "<h1>Home</h1>",
    });

    useDesignStore.getState().navigateToPage("settings");
    const history = getActionHistory();
    expect(history.some(e => e.action === "navigateToPage:not-found")).toBe(true);
    console.log("[DEBUG] ✓ 'settings' correctly NOT found");
  });
});

describe("Tab navigation — debug trace", () => {
  it("click '代码' tab → debug history records it → store updates → DOM switches", async () => {
    const user = userEvent.setup();
    render(<App />);

    // ---- Step 1: Verify initial state ----
    const initialStore = useDesignStore.getState();
    expect(initialStore.activeTab).toBe("chat");

    // ---- Step 2: Find the "代码" button ----
    const codeButton = screen.getByRole("button", { name: /代码/ });
    expect(codeButton).toBeInTheDocument();
    console.log("[DEBUG] Found '代码' button:", codeButton.outerHTML.slice(0, 120));

    // ---- Step 3: Click it ----
    await user.click(codeButton);

    // ---- Step 4: Check debug history (was logClick called?) ----
    const history = getActionHistory();
    console.log("[DEBUG] Action history after click:", JSON.stringify(history, null, 2));

    const clickEntry = history.find((e) => e.action === "click:tab-bar");
    expect(clickEntry).toBeTruthy();
    expect(clickEntry.target).toBe("code");

    const setTabEntry = history.find((e) => e.action === "setActiveTab");
    expect(setTabEntry).toBeTruthy();
    expect(setTabEntry.to).toBe("code");

    // ---- Step 5: Check store state (was setActiveTab called?) ----
    const storeAfter = useDesignStore.getState();
    expect(storeAfter.activeTab).toBe("code");
    console.log("[DEBUG] Store activeTab after click:", storeAfter.activeTab);

    // ---- Step 6: Check DOM (did the panel switch?) ----
    // ChatPanel should unmount → "欢迎使用 FigmaMaster" should disappear
    const welcomeMsg = screen.queryByText(/欢迎使用 FigmaMaster/);
    expect(welcomeMsg).not.toBeInTheDocument();
    console.log("[DEBUG] Welcome message removed from DOM:", welcomeMsg === null);

    // ---- Step 7: Click "对话" tab to switch back ----
    const chatButton = screen.getByRole("button", { name: /对话/ });
    await user.click(chatButton);
    expect(useDesignStore.getState().activeTab).toBe("chat");

    // ---- Step 8: Verify final debug history ----
    const finalHistory = getActionHistory();
    console.log("[DEBUG] Final action history:", JSON.stringify(finalHistory, null, 2));
    const chatClickEntry = finalHistory.find(
      (e) => e.action === "click:tab-bar" && e.target === "chat",
    );
    expect(chatClickEntry).toBeTruthy();
  });
});
