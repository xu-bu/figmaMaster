import { useState, useCallback, useRef, useEffect } from "react";

export default function SplitPanel({
  left,
  right,
  defaultLeftWidth = 40,
  minLeftWidth = 30,
  maxLeftWidth = 65,
}) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftWidth(Math.min(Math.max(newWidth, minLeftWidth), maxLeftWidth));
    },
    [isDragging, minLeftWidth, maxLeftWidth]
  );

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className="flex flex-1 min-h-0 overflow-hidden">
      <div
        className="shrink-0 overflow-hidden border-r border-border"
        style={{ width: `${leftWidth}%` }}
      >
        {left}
      </div>

      <div
        className={`w-1 shrink-0 cursor-col-resize bg-border hover:bg-primary/50 transition-colors relative group ${
          isDragging ? "bg-primary" : ""
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -left-1 -right-1" />
        <div
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-8 rounded-full bg-muted-foreground/30 group-hover:bg-primary/70 transition-colors ${
            isDragging ? "bg-primary" : ""
          }`}
        />
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">{right}</div>
    </div>
  );
}
