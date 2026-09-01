import { AsyncLocalStorage } from "node:async_hooks";

export type RequestStore = {
  requestId: string;
};

const storage = new AsyncLocalStorage<RequestStore>();

export function runWithRequestContext<T>(
  store: RequestStore,
  callback: () => T,
): T {
  return storage.run(store, callback);
}

export function getRequestId(): string {
  const store = storage.getStore();
  if (!store) {
    throw new Error("Request context is not available");
  }
  return store.requestId;
}

export function getRequestStore(): RequestStore | undefined {
  return storage.getStore();
}
