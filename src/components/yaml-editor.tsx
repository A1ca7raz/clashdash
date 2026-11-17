"use client";

import { yaml } from "@codemirror/lang-yaml";
import dynamic from "next/dynamic";
import type { KeyboardEvent } from "react";

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
  onSubmit,
}: {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  height?: string;
  /** Called on Alt+Enter (plain Enter keeps inserting newlines). */
  onSubmit?: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onSubmit || !event.altKey || event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    onSubmit();
  };
  return (
    <div className="overflow-hidden rounded-lg border text-[13px]" onKeyDown={handleKeyDown}>
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
