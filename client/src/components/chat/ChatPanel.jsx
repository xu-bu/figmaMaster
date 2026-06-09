import { useRef, useEffect } from "react";
import { useDesignStore } from "../../stores/designStore";
import MessageBubble from "./MessageBubble";
import PromptInput from "./PromptInput";
import PreferencePanel from "./PreferencePanel";
import { AlertCircle } from "lucide-react";

export default function ChatPanel() {
  const { messages, isGenerating, error, clearError } = useDesignStore();
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

      <PromptInput />
    </div>
  );
}
