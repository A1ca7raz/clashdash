export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "从未";
  return new Date(d).toLocaleString("zh-CN", { hour12: false });
}

export function formatDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString("zh-CN");
}

export function formatRelative(d: Date | string | null | undefined): string {
  if (!d) return "从未";
  const diff = Date.now() - new Date(d).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} 小时前`;
  return `${Math.round(h / 24)} 天前`;
}
