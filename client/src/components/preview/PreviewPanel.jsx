import PreviewToolbar from "./PreviewToolbar";
import MultiPagePreview from "./MultiPagePreview";

export default function PreviewPanel() {
  return (
    <div className="flex flex-col h-full">
      <PreviewToolbar />
      <MultiPagePreview />
    </div>
  );
}
