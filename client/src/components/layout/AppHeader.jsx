import { useDesignStore } from "../../stores/designStore";
import { Palette, RotateCcw } from "lucide-react";

export default function AppHeader() {
  const { resetChat, showPreferences, setShowPreferences } = useDesignStore();

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
            F
          </div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            FigmaMaster
          </h1>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
          AI Design Generator
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowPreferences(!showPreferences)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
            showPreferences
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
          title="设计偏好设置"
        >
          <Palette className="w-4 h-4" />
          <span className="hidden sm:inline">偏好</span>
        </button>

        <button
          onClick={resetChat}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          title="重新开始"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="hidden sm:inline">重置</span>
        </button>
      </div>
    </header>
  );
}
