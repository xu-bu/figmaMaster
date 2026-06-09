import { useDesignStore } from "../../stores/designStore";
import { LayoutGrid, FileCode } from "lucide-react";
import PreviewFrame from "./PreviewFrame";
import { logClick, logRender } from "../../utils/debug";

export default function MultiPagePreview() {
  const { currentPages, activePageIndex, sharedContext, setActivePage } =
    useDesignStore();
  logRender("MultiPagePreview", { pageCount: currentPages?.length, activePageIndex });

  if (!currentPages || currentPages.length === 0) {
    return (
      <div className="flex flex-1 min-h-0">
        <PreviewFrame />
      </div>
    );
  }

  const activePage = currentPages[activePageIndex];

  return (
    <div className="flex flex-col h-full">
      {/* Page tabs */}
      <div className="flex items-center border-b border-border bg-card shrink-0 overflow-x-auto">
        {/* Shared context badge */}
        {sharedContext && (
          <div className="flex items-center gap-1 px-3 py-2 text-[10px] text-muted-foreground border-r border-border shrink-0">
            <div
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: sharedContext.primaryColor || "#3B82F6" }}
              title={`主色: ${sharedContext.primaryColor}`}
            />
            <span className="hidden sm:inline">{currentPages.length} 页</span>
          </div>
        )}

        {currentPages.map((page, i) => (
          <button
            key={i}
            onClick={() => {
              logClick("page-tab", page.name || `page-${i}`, { index: i, fromIndex: activePageIndex });
              setActivePage(i);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 shrink-0 ${
              i === activePageIndex
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <FileCode className="w-3 h-3" />
            {page.name || `页面 ${i + 1}`}
          </button>
        ))}
      </div>

      {/* Active page preview — must be flex container so iframe fills full height */}
      <div className="flex flex-1 min-h-0">
        <PreviewFrame page={activePage} />
      </div>
    </div>
  );
}
