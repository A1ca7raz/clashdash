import { rethrowDatabaseError } from "./errors";

type Queryable = { query: (...args: never[]) => unknown };
const guarded = new WeakSet<object>();

export function guardDatabaseClient<T extends object>(client: T): T {
  if (guarded.has(client)) return client;
  const target = client as T & Partial<Queryable>;
  if (typeof target.query !== "function") return client;
  guarded.add(client);
  const query = target.query.bind(client);
  target.query = (async (...args: never[]) => {
    try {
      return await query(...args);
    } catch (err) {
      rethrowDatabaseError(err);
    }
  }) as Queryable["query"];
  return client;
}
