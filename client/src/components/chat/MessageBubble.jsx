import { Bot, User, Sparkles } from "lucide-react";

export default function MessageBubble({ message }) {
  const isSystem = message.role === "system";
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={`flex gap-3 px-4 py-3 ${
        isUser
          ? "bg-muted/30"
          : isAssistant
          ? "bg-primary/5 border-l-2 border-primary/30"
          : "bg-muted/20"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isSystem
            ? "bg-gradient-to-br from-blue-400 to-purple-500"
            : isUser
            ? "bg-foreground/10"
            : "bg-gradient-to-br from-green-400 to-emerald-500"
        }`}
      >
        {isSystem ? (
          <Sparkles className="w-3.5 h-3.5 text-white" />
        ) : isUser ? (
          <User className="w-3.5 h-3.5 text-foreground/60" />
        ) : (
          <Bot className="w-3.5 h-3.5 text-white" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-muted-foreground">
            {isSystem ? "FigmaMaster" : isUser ? "你" : "AI 设计师"}
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            {new Date(message.timestamp).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div
          className="text-sm text-foreground leading-relaxed whitespace-pre-wrap [&_strong]:font-semibold"
          dangerouslySetInnerHTML={{
            __html: message.content.replace(
              /\*\*(.*?)\*\*/g,
              "<strong>$1</strong>"
            ),
          }}
        />
      </div>
    </div>
  );
}
