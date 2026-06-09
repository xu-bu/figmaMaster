import { useDesignStore } from "../../stores/designStore";
import { Copy, Check, FileCode } from "lucide-react";
import { useState, useCallback, useMemo } from "react";

export default function CodePanel() {
  const { currentPages, activePageIndex, currentHtml } = useDesignStore();
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState("jsx"); // "jsx" | "js" | "html"

  const activePage = currentPages?.[activePageIndex];
  const displayCode = useMemo(() => {
    if (activePage) {
      if (viewMode === "jsx") return activePage.jsx || "// No JSX available";
      if (viewMode === "js") return activePage.js || "// No transpiled JS available";
      return activePage.html || currentHtml || "";
    }
    return currentHtml || "";
  }, [activePage, currentHtml, viewMode]);

  const handleCopy = useCallback(() => {
    if (!displayCode) return;
    try {
      navigator.clipboard.writeText(displayCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    } catch {
      const ta = document.createElement("textarea");
      ta.value = displayCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [displayCode]);

  if (!displayCode) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-lg bg-muted flex items-center justify-center">
            <svg className="w-6 h-6 text-muted-foreground/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
            </svg>
          </div>
          <p className="text-sm">还没有生成代码</p>
          <p className="text-xs text-muted-foreground/60 mt-1">先生成一个设计后查看代码</p>
        </div>
      </div>
    );
  }

  const lineCount = displayCode.split("\n").length;
  const charCount = displayCode.length;

  const codeModes = activePage
    ? [
        { key: "jsx", label: "JSX" },
        { key: "js", label: "JS" },
        { key: "html", label: "HTML" },
      ]
    : [{ key: "html", label: "HTML" }];

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-3">
          {/* Code type tabs */}
          <div className="flex items-center bg-muted rounded-md p-0.5">
            {codeModes.map((m) => (
              <button
                key={m.key}
                onClick={() => setViewMode(m.key)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  viewMode === m.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {activePage && (
              <>
                <FileCode className="w-3 h-3" />
                <span>{activePage.name}</span>
                <span className="text-border">|</span>
              </>
            )}
            <span>{lineCount} 行</span>
            <span className="text-border">|</span>
            <span>{(charCount / 1024).toFixed(1)} KB</span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-green-500" />
              <span className="text-green-500">已复制</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>复制代码</span>
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <div className="flex-1 overflow-auto bg-[#1e1e2e] text-[#cdd6f4]">
        <pre className="p-4 text-xs leading-relaxed" style={{ fontFamily: "monospace" }}>
          <code>{displayCode}</code>
        </pre>
      </div>
    </div>
  );
}
