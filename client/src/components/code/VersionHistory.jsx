import { useEffect } from "react";
import { useDesignStore } from "../../stores/designStore";
import { History, Loader2, ArrowLeft, Trash2, CheckSquare, Square } from "lucide-react";

export default function VersionHistory() {
  const {
    versions, versionsLoading, selectedVersions,
    loadVersions, restoreVersion, deleteVersion, deleteSelectedVersions,
    toggleVersionSelect, selectAllVersions,
  } = useDesignStore();

  useEffect(() => { loadVersions(); }, [loadVersions]);

  const allSelected = versions.length > 0 && selectedVersions.size === versions.length;
  const someSelected = selectedVersions.size > 0;

  if (versionsLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <History className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-sm">暂无历史版本</p>
          <p className="text-xs text-muted-foreground/60 mt-1">生成设计后会自动保存</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with batch actions */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={selectAllVersions}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {allSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
            全选
          </button>
          <span className="text-sm font-medium text-foreground">
            {versions.length} 个版本
          </span>
        </div>
        {someSelected && (
          <button
            onClick={deleteSelectedVersions}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            删除 ({selectedVersions.size})
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {versions.map((version) => {
          const isSelected = selectedVersions.has(version.id);
          return (
            <div
              key={version.id}
              className={`flex items-start gap-2 px-4 py-3 border-b border-border/50 transition-colors group ${
                isSelected ? "bg-primary/5" : "hover:bg-muted/30"
              }`}
            >
              {/* Checkbox */}
              <button
                onClick={() => toggleVersionSelect(version.id)}
                className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
              >
                {isSelected ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
              </button>

              {/* Content — click to restore */}
              <button
                onClick={() => restoreVersion(version.id)}
                className="flex-1 text-left min-w-0"
              >
                <h4 className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                  {version.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {version.description}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-muted-foreground/60">
                    {new Date(version.createdAt).toLocaleString("zh-CN")}
                  </span>
                  <span className="text-[10px] text-muted-foreground/40 truncate">
                    {version.prompt?.slice(0, 40)}...
                  </span>
                </div>
              </button>

              {/* Delete */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteVersion(version.id); }}
                className="shrink-0 p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
