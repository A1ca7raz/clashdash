"use client";

import { Trash2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Checkbox } from "@/components/ui/checkbox";

export function useBatchManagement(ids: number[]) {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    const available = new Set(ids);
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [ids]);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    allSelected: ids.length > 0 && selectedIds.size === ids.length,
    partiallySelected: selectedIds.size > 0 && selectedIds.size < ids.length,
    clear: () => setSelectedIds(new Set()),
    toggle: (id: number) =>
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () => setSelectedIds((current) => (current.size === ids.length ? new Set() : new Set(ids))),
  };
}

export type BatchManagement = ReturnType<typeof useBatchManagement>;

export function BatchManagementControls({
  batch,
  totalCount,
  pending,
  deleteDescription,
  onDelete,
}: {
  batch: BatchManagement;
  totalCount: number;
  pending: boolean;
  deleteDescription: string;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          aria-label="全选"
          checked={batch.allSelected ? true : batch.partiallySelected ? "indeterminate" : false}
          disabled={pending || !totalCount}
          onCheckedChange={batch.toggleAll}
        />
        全选
      </label>
      <span className="text-sm text-muted-foreground">已选 {batch.selectedCount} 项</span>
      <ConfirmButton
        title={`删除所选 ${batch.selectedCount} 项？`}
        description={deleteDescription}
        variant="destructive"
        size="sm"
        disabled={pending || !batch.selectedCount}
        onConfirm={onDelete}
      >
        <Trash2Icon />
        {pending ? "删除中..." : "删除所选"}
      </ConfirmButton>
    </div>
  );
}

export function BatchSelectionCheckbox({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return <Checkbox aria-label={label} checked={checked} disabled={disabled} onCheckedChange={onToggle} />;
}
