"use client";

import { yaml } from "@codemirror/lang-yaml";
import dynamic from "next/dynamic";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <div className="h-full min-h-40 animate-pulse rounded-lg bg-muted" />,
});

const extensions = [yaml()];

export function YamlEditor({
  value,
  onChange,
  readOnly,
  height = "480px",
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border text-[13px]">
      <CodeMirror
        value={value}
        height={height}
        extensions={extensions}
        onChange={onChange}
        readOnly={readOnly}
        editable={!readOnly}
        basicSetup={{ lineNumbers: true, foldGutter: true, highlightActiveLine: !readOnly }}
      />
    </div>
  );
}
