export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || !process.env.ADMIN_OVERRIDE_PASSWORD) return;
  const node = await import("./instrumentation-node");
  return node.register();
}
