import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { useDesignStore } from "../../stores/designStore";

export default function PreviewFrame({ page }) {
  const { currentHtml, previewDevice, currentPages, activePageIndex, globalStore, navigateToPage, updateGlobalStore } =
    useDesignStore();

  const iframeRef = useRef(null);
  const [iframeKey, setIframeKey] = useState(0);

  // ---- postMessage handler: navigate / getStore / updateStore ----
  const handleMessage = useCallback((e) => {
    const iframe = iframeRef.current;
    const { type, page: pageName, params, payload } = e.data || {};
    if (!type || !iframe) return;

    switch (type) {
      case "navigate":
        navigateToPage(pageName);
        break;
      case "getStore":
        iframe.contentWindow?.postMessage({ type: "storeData", data: globalStore }, "*");
        break;
      case "updateStore":
        updateGlobalStore(payload);
        // Echo back updated store so the page can re-render if needed
        iframe.contentWindow?.postMessage({ type: "storeData", data: { ...globalStore, ...payload } }, "*");
        break;
    }
  }, [globalStore, navigateToPage, updateGlobalStore]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Use provided page or active page or fallback to legacy currentHtml
  const activePage = page || currentPages?.[activePageIndex];
  const displayHtml = activePage?.html || currentHtml;

  // Build HTML with import maps if we have a page with JS/importMap
  const htmlWithImports = useMemo(() => {
    if (!activePage) return displayHtml;

    // Build correct importmap JSON (with sub-path prefix mappings)
    const importMap = { imports: activePage.importMap || {} };
    // Ensure trailing-slash prefixes for sub-path resolution (e.g., react-dom/client)
    for (const [k, v] of Object.entries(importMap.imports)) {
      if (!k.endsWith("/")) importMap.imports[k + "/"] = v + "/";
    }
    const importMapJson = JSON.stringify(importMap, null, 0);

    // If the page already has a complete HTML document, inject the correct importmap
    if (activePage.html && activePage.html.includes("<!DOCTYPE")) {
      // Replace the LLM-generated importmap (which may be incomplete) with ours
      return activePage.html.replace(
        /<script type="importmap">[^<]*<\/script>/,
        `<script type="importmap">${importMapJson}</script>`
      );
    }

    // Otherwise, wrap the JS in a full HTML document with correct import maps
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${activePage.title || activePage.name || "Preview"}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; }
    #root { min-height: 100vh; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="importmap">${importMapJson}</script>
  <script type="module">
    ${activePage.js || ""}
  </script>
</body>
</html>`;
  }, [activePage, displayHtml]);

  useEffect(() => {
    if (iframeRef.current && htmlWithImports) {
      iframeRef.current.srcdoc = htmlWithImports;
    }
  }, [htmlWithImports, iframeKey]);

  const getDeviceWidth = () => {
    switch (previewDevice) {
      case "mobile":
        return "375px";
      case "tablet":
        return "768px";
      default:
        return "100%";
    }
  };

  if (!displayHtml) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/10">
        <div className="text-center max-w-sm px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              />
            </svg>
          </div>
          <h3 className="text-base font-medium text-foreground mb-2">
            等待生成设计
          </h3>
          <p className="text-sm text-muted-foreground">
            在左侧输入你想要的应用描述，AI 将为每个页面生成完整设计并在此预览。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex justify-center bg-muted/10 min-h-0">
      <div
        className="flex flex-col transition-all duration-300 shadow-lg bg-white"
        style={{
          width: getDeviceWidth(),
          maxWidth: "100%",
          borderRadius:
            previewDevice === "mobile"
              ? "24px"
              : previewDevice === "tablet"
              ? "12px"
              : "0",
          overflow: "hidden",
        }}
      >
        <iframe
          key={iframeKey}
          ref={iframeRef}
          sandbox="allow-scripts"
          title={activePage?.title || "Design Preview"}
          className="flex-1 w-full border-0"
        />
      </div>
    </div>
  );
}
