import { DatabaseInitializationRequired, isDatabaseInitializationRequired } from "./errors";

const proxies = new WeakMap<object, object>();

function normalizeError(err: unknown): unknown {
  if (err instanceof DatabaseInitializationRequired) return err;
  if (isDatabaseInitializationRequired(err)) return new DatabaseInitializationRequired();
  return err;
}

function wrap<T>(value: T): T {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") return value;
  const object = value as object;
  if (proxies.has(object)) return proxies.get(object) as T;
  const proxy = new Proxy(object, {
    get(target, property, receiver) {
      const member = Reflect.get(target, property, receiver);
      if (typeof member !== "function") return member;
      if (property === "then") {
        return (onFulfilled?: unknown, onRejected?: unknown) => {
          const reject = (err: unknown) => {
            const normalized = normalizeError(err);
            if (typeof onRejected === "function") return onRejected(normalized);
            throw normalized;
          };
          return Reflect.apply(member, target, [onFulfilled, reject]);
        };
      }
      if (property === "transaction") {
        return (callback: (tx: unknown) => unknown, ...args: unknown[]) =>
          Reflect.apply(member, target, [(tx: unknown) => callback(wrap(tx)), ...args]);
      }
      return (...args: unknown[]) => wrap(Reflect.apply(member, target, args));
    },
  });
  proxies.set(object, proxy);
  return proxy as T;
}

export function guardDb<T extends object>(db: T): T {
  return wrap(db);
}
