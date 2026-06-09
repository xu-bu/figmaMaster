import { useState, useRef, useEffect } from "react";
import { useDesignStore } from "../../stores/designStore";
import { Send, Loader2 } from "lucide-react";

export default function PromptInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef(null);
  const { sendPrompt, isGenerating } = useDesignStore();

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
  }, [input]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isGenerating) return;
    const prompt = input.trim();
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await sendPrompt(prompt);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="flex items-end gap-2 bg-muted/50 rounded-xl border border-border focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isGenerating
              ? "AI 正在生成设计..."
              : "描述你想要的界面设计... (Enter 发送, Shift+Enter 换行)"
          }
          disabled={isGenerating}
          rows={1}
          className="flex-1 bg-transparent resize-none px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isGenerating}
          className="shrink-0 m-1.5 p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground/50 mt-2 text-center">
        使用 DeepSeek 驱动 · 生成的内容仅供参考
      </p>
    </div>
  );
}
