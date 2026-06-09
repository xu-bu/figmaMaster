import { useRef, useEffect } from "react";
import { useDesignStore } from "../../stores/designStore";
import MessageBubble from "./MessageBubble";
import PromptInput from "./PromptInput";
import PreferencePanel from "./PreferencePanel";
import { AlertCircle, AlertTriangle, X } from "lucide-react";

export default function ChatPanel() {
  const { messages, isGenerating, error, clearError, pendingReplaceConfirm, confirmReplacePages } = useDesignStore();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <PreferencePanel />

      {error && (
        <div className="mx-4 mt-2 flex items-center gap-2 px-3 py-2 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button
            onClick={clearError}
            className="text-destructive/70 hover:text-destructive font-medium shrink-0"
          >
            关闭
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isGenerating && (
          <div className="flex items-center gap-2 px-4 py-3 bg-muted/20">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shrink-0">
              <div className="flex gap-0.5">
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
            <span className="text-sm text-muted-foreground">AI 正在生成设计...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Page replacement confirmation dialog */}
      {pendingReplaceConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-card rounded-xl shadow-2xl border border-border max-w-md w-full mx-4 overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-foreground mb-1">检测到页面变更</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    AI 认为以下页面将被移除：
                  </p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {pendingReplaceConfirm.removedPages.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20"
                      >
                        <X className="w-3 h-3 mr-1" />
                        {name}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    建议的新页面: {pendingReplaceConfirm.newPageNames.join("、")}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 bg-muted/30 border-t border-border">
              <button
                onClick={() => confirmReplacePages(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors"
              >
                保留现有页面
              </button>
              <button
                onClick={() => confirmReplacePages(true)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                替换为新页面
              </button>
            </div>
          </div>
        </div>
      )}

      <PromptInput />
    </div>
  );
}
