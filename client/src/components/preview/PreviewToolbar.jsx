import { useDesignStore } from "../../stores/designStore";
import { Monitor, Tablet, Smartphone, Maximize2, RefreshCw } from "lucide-react";

export default function PreviewToolbar() {
  const { previewDevice, setPreviewDevice, currentHtml, currentTitle } =
    useDesignStore();

  const handleRefresh = () => {
    const frame = document.querySelector("iframe");
    if (frame && currentHtml) {
      frame.srcdoc = currentHtml;
    }
  };

  const handleFullscreen = () => {
    const frame = document.querySelector("iframe");
    if (frame) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        frame.requestFullscreen();
      }
    }
  };

  const devices = [
    { key: "desktop", icon: Monitor, label: "桌面" },
    { key: "tablet", icon: Tablet, label: "平板" },
    { key: "mobile", icon: Smartphone, label: "手机" },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-foreground truncate">
          {currentTitle || "预览"}
        </span>
        {currentHtml && (
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded hidden sm:inline">
            HTML
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <div className="flex items-center bg-muted rounded-md p-0.5">
          {devices.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setPreviewDevice(key)}
              className={`p-1.5 rounded transition-colors ${
                previewDevice === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title={label}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border mx-1" />

        <button
          onClick={handleRefresh}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="刷新预览"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleFullscreen}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="全屏预览"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
