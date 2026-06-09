// IndexedDB store for FileSystemDirectoryHandle objects.
// Handles aren't JSON-serializable but ARE structured-clonable to IndexedDB.

const DB_NAME = "0101_folders";
const STORE = "handles";
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(id: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getHandle(id: string): Promise<FileSystemDirectoryHandle | undefined> {
  const db = await open();
  const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return handle;
}

export async function deleteHandle(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: "read" | "readwrite" = "readwrite",
): Promise<boolean> {
  // @ts-expect-error - non-standard but widely implemented in Chromium
  const current: PermissionState = await handle.queryPermission({ mode });
  if (current === "granted") return true;
  // @ts-expect-error - non-standard
  const next: PermissionState = await handle.requestPermission({ mode });
  return next === "granted";
}

export type FolderEntry = {
  name: string;
  kind: "file" | "directory";
  size?: number;
};

export async function listEntries(handle: FileSystemDirectoryHandle): Promise<FolderEntry[]> {
  const out: FolderEntry[] = [];
  const iter = (
    handle as unknown as {
      values: () => AsyncIterable<FileSystemHandle>;
    }
  ).values();
  for await (const entry of iter) {
    if (entry.kind === "file") {
      try {
        const file = await (entry as FileSystemFileHandle).getFile();
        out.push({ name: entry.name, kind: "file", size: file.size });
      } catch {
        out.push({ name: entry.name, kind: "file" });
      }
    } else {
      out.push({ name: entry.name, kind: "directory" });
    }
  }
  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function isFsAccessSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { showDirectoryPicker?: () => unknown }).showDirectoryPicker ===
      "function"
  );
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  // @ts-expect-error - showDirectoryPicker is on window in Chromium
  return window.showDirectoryPicker({ mode: "readwrite" });
}
