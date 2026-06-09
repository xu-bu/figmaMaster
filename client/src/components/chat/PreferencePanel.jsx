import { useDesignStore } from "../../stores/designStore";
import { X, Lock, Edit3, Check } from "lucide-react";
import { useRef, useEffect } from "react";

export default function PreferencePanel() {
  const {
    preferences,
    interactions,
    prefsLocked,
    draftAesthetic,
    draftInteraction,
    setDraftAesthetic,
    setDraftInteraction,
    applyPreferences,
    startEditing,
    showPreferences,
    setShowPreferences,
  } = useDesignStore();

  const aestheticRef = useRef(null);

  useEffect(() => {
    if (showPreferences && !prefsLocked) {
      aestheticRef.current?.focus();
    }
  }, [showPreferences, prefsLocked]);

  if (!showPreferences) return null;

  return (
    <div className="border-b border-border bg-muted/20">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">设计偏好设置</h3>
          {prefsLocked && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              <Lock className="w-3 h-3" />
              已锁定
            </span>
          )}
        </div>
        <button
          onClick={() => setShowPreferences(false)}
          className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4 max-h-80 overflow-y-auto">
        {/* Aesthetic */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            🎨 审美偏好
          </label>
          {prefsLocked ? (
            <div className="p-3 bg-background border border-border rounded-lg text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {preferences.aesthetic}
            </div>
          ) : (
            <div>
              <textarea
                ref={aestheticRef}
                value={draftAesthetic}
                onChange={(e) => setDraftAesthetic(e.target.value)}
                placeholder="描述你想要的审美风格，例如：深色主题，暗色背景 + 亮色强调，大标题宽松行距的杂志风格，毛玻璃透明层次..."
                rows={4}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none transition-all"
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                用自然语言自由描述配色、字体、间距、风格偏好
              </p>
            </div>
          )}
        </div>

        {/* Interaction */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            🧭 交互方式
          </label>
          {prefsLocked ? (
            <div className="p-3 bg-background border border-border rounded-lg text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {interactions.interaction}
            </div>
          ) : (
            <div>
              <textarea
                value={draftInteraction}
                onChange={(e) => setDraftInteraction(e.target.value)}
                placeholder="描述你期望的交互方式，例如：顶部标签栏导航，丰富动效页面切换动画，模态对话框确认 + 内联验证..."
                rows={3}
                className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 resize-none transition-all"
              />
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                描述导航方式、动效风格、反馈机制
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end pt-1 gap-2">
          {prefsLocked ? (
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-border hover:border-primary/30 hover:text-primary transition-all"
            >
              <Edit3 className="w-3.5 h-3.5" />
              编辑
            </button>
          ) : (
            <button
              onClick={applyPreferences}
              disabled={!draftAesthetic.trim() || !draftInteraction.trim()}
              className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg bg-[#FF6B35] text-white hover:bg-[#e55d2b] disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
            >
              <Check className="w-3.5 h-3.5" />
              保存
            </button>
          )}
        </div>

        {prefsLocked && (
          <p className="text-[10px] text-muted-foreground/50 text-center">
            已保存。点击"编辑"可修改。
          </p>
        )}
      </div>
    </div>
  );
}
