export const DEFAULT_TEMPORARY_DOCUMENT_TTL_MS = 30 * 60 * 1000;

type TimeoutHandle = ReturnType<typeof setTimeout>;

export interface TemporaryDocumentOwnerOptions {
  readonly ttlMs?: number;
  readonly setTimeoutFn?: (callback: () => void, timeoutMs: number) => TimeoutHandle;
  readonly clearTimeoutFn?: (handle: TimeoutHandle) => void;
  readonly onCleanupError?: (error: unknown, documentID: number) => void;
}

export type TemporaryDocumentDeleteResult = "deleted" | "already-deleted" | "not-owned";
export type TemporaryDocumentDeleteExecutor = (
  deleteNative: () => void | Promise<void>
) => void | Promise<void>;

export interface TemporaryDocumentOwner {
  configure(options: TemporaryDocumentOwnerOptions): void;
  register(
    documentID: number,
    deleteNative: () => void | Promise<void>,
    defaultExecutor?: TemporaryDocumentDeleteExecutor
  ): void;
  delete(
    documentID: number,
    executor?: TemporaryDocumentDeleteExecutor
  ): Promise<TemporaryDocumentDeleteResult>;
  destroy(): Promise<void>;
}

interface OwnedTemporaryDocument {
  readonly deleteNative: () => void | Promise<void>;
  readonly defaultExecutor?: TemporaryDocumentDeleteExecutor;
  timer: TimeoutHandle | undefined;
  deletion: Promise<void> | undefined;
}

const MAX_TOMBSTONES = 256;

/**
 * Owns temporary Photoshop document ids and their native cleanup.
 *
 * This intentionally does not use the generic remote handle registry: pruning a handle only drops
 * a JavaScript map entry, while a temporary document must actively call the native delete API.
 */
export function createTemporaryDocumentOwner(
  initialOptions: TemporaryDocumentOwnerOptions = {}
): TemporaryDocumentOwner {
  let ttlMs = initialOptions.ttlMs ?? DEFAULT_TEMPORARY_DOCUMENT_TTL_MS;
  let setTimeoutFn = initialOptions.setTimeoutFn ?? setTimeout;
  let clearTimeoutFn = initialOptions.clearTimeoutFn ?? clearTimeout;
  let onCleanupError = initialOptions.onCleanupError ?? (() => undefined);
  const owned = new Map<number, OwnedTemporaryDocument>();
  const tombstones = new Set<number>();
  const tombstoneOrder: number[] = [];

  function configure(options: TemporaryDocumentOwnerOptions): void {
    if (owned.size > 0) {
      throw new Error("Cannot configure temporary document cleanup while documents are owned.");
    }
    ttlMs = options.ttlMs ?? DEFAULT_TEMPORARY_DOCUMENT_TTL_MS;
    setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    clearTimeoutFn = options.clearTimeoutFn ?? clearTimeout;
    onCleanupError = options.onCleanupError ?? (() => undefined);
    assertTtl(ttlMs);
  }

  function register(
    documentID: number,
    deleteNative: () => void | Promise<void>,
    defaultExecutor?: TemporaryDocumentDeleteExecutor
  ): void {
    if (owned.has(documentID)) {
      throw new Error(`Temporary document ${documentID} is already owned by this bridge.`);
    }
    tombstones.delete(documentID);
    const entry: OwnedTemporaryDocument = {
      deleteNative,
      ...(defaultExecutor === undefined ? {} : { defaultExecutor }),
      timer: undefined,
      deletion: undefined
    };
    owned.set(documentID, entry);
    schedule(documentID, entry);
  }

  async function deleteDocument(
    documentID: number,
    executor?: TemporaryDocumentDeleteExecutor
  ): Promise<TemporaryDocumentDeleteResult> {
    const entry = owned.get(documentID);
    if (!entry) {
      return tombstones.has(documentID) ? "already-deleted" : "not-owned";
    }
    await startDeletion(documentID, entry, executor);
    return "deleted";
  }

  function destroy(): Promise<void> {
    const deletions = [...owned].map(([documentID, entry]) =>
      startDeletion(documentID, entry).catch((error) => {
        onCleanupError(error, documentID);
        throw error;
      })
    );
    return Promise.all(deletions).then(() => undefined);
  }

  function schedule(documentID: number, entry: OwnedTemporaryDocument): void {
    clearTimer(entry);
    entry.timer = setTimeoutFn(() => {
      entry.timer = undefined;
      void startDeletion(documentID, entry).catch((error) => onCleanupError(error, documentID));
    }, ttlMs);
  }

  function startDeletion(
    documentID: number,
    entry: OwnedTemporaryDocument,
    executor = entry.defaultExecutor
  ): Promise<void> {
    if (entry.deletion) {
      return entry.deletion;
    }
    clearTimer(entry);
    const deletion = Promise.resolve()
      .then(() => executor ? executor(entry.deleteNative) : entry.deleteNative())
      .then(() => {
        if (owned.get(documentID) === entry) {
          owned.delete(documentID);
          rememberDeleted(documentID);
        }
      })
      .catch((error: unknown) => {
        entry.deletion = undefined;
        if (owned.get(documentID) === entry) {
          schedule(documentID, entry);
        }
        throw error;
      });
    entry.deletion = deletion;
    return deletion;
  }

  function clearTimer(entry: OwnedTemporaryDocument): void {
    if (entry.timer !== undefined) {
      clearTimeoutFn(entry.timer);
      entry.timer = undefined;
    }
  }

  function rememberDeleted(documentID: number): void {
    if (tombstones.has(documentID)) {
      return;
    }
    tombstones.add(documentID);
    tombstoneOrder.push(documentID);
    if (tombstoneOrder.length > MAX_TOMBSTONES) {
      const expired = tombstoneOrder.shift();
      if (expired !== undefined) {
        tombstones.delete(expired);
      }
    }
  }

  assertTtl(ttlMs);
  return { configure, register, delete: deleteDocument, destroy };
}

function assertTtl(value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Temporary document TTL must be a positive finite number.");
  }
}
