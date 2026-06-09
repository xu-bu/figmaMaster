import AppHeader from "./components/layout/AppHeader";
import SplitPanel from "./components/layout/SplitPanel";
import ChatPanel from "./components/chat/ChatPanel";
import PreviewPanel from "./components/preview/PreviewPanel";
import CodePanel from "./components/code/CodePanel";
import VersionHistory from "./components/code/VersionHistory";
import { useDesignStore } from "./stores/designStore";
import { MessageSquare, Code, History } from "lucide-react";

const TABS = [
  { key: "chat", icon: MessageSquare, label: "对话" },
  { key: "code", icon: Code, label: "代码" },
  { key: "versions", icon: History, label: "版本" },
];

export default function App() {
  const { activeTab, setActiveTab } = useDesignStore();

  return (
    <div className="h-screen flex flex-col">
      <AppHeader />

      <SplitPanel
        left={
          <div className="flex flex-col h-full">
            {/* Tab bar */}
            <div className="flex items-center border-b border-border bg-card shrink-0">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="hidden sm:inline">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === "chat" && <ChatPanel />}
            {activeTab === "code" && <CodePanel />}
            {activeTab === "versions" && <VersionHistory />}
          </div>
        }
        right={<PreviewPanel />}
        defaultLeftWidth={42}
        minLeftWidth={32}
        maxLeftWidth={60}
      />
    </div>
  );
}
