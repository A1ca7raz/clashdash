export const DATABASE_INITIALIZATION_DIGEST = "CLASHDASH_DATABASE_INITIALIZATION_REQUIRED";

export class DatabaseInitializationRequired extends Error {
  readonly digest = DATABASE_INITIALIZATION_DIGEST;

  constructor(readonly reason: "schema" | "admin" = "schema") {
    super("数据库尚未初始化或结构不完整");
    this.name = "DatabaseInitializationRequired";
  }
}

export function isDatabaseInitializationRequired(err: unknown): boolean {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if (current instanceof DatabaseInitializationRequired) return true;
    if ("digest" in current && current.digest === DATABASE_INITIALIZATION_DIGEST) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export function isUndefinedTableError(err: unknown): boolean {
  let current = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    if ("code" in current && current.code === "42P01") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export function rethrowDatabaseError(err: unknown): never {
  if (isUndefinedTableError(err)) throw new DatabaseInitializationRequired();
  throw err;
}
