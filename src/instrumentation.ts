export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const node = await import("./instrumentation-node");
    return node.register();
  }
}
