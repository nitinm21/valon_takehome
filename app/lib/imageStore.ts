// IndexedDB-backed store for slide images.
//
// Slide images are large (~1.4MB base64 each). Keeping them in `localStorage`
// blows its ~5MB string quota after a few slides and, worse, forces the whole
// deck to be re-serialized synchronously on every keystroke. IndexedDB stores
// them off the main thread with a much larger quota, keyed by slide id, so the
// localStorage payload stays tiny (text/metadata only) and editing stays fast.

const DB_NAME = "valon-presentation-takehome";
const STORE = "slide-images";
const DB_VERSION = 1;

function isAvailable(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T> | null
): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = work(store);
        tx.oncomplete = () => {
          db.close();
          resolve(request ? request.result : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

/** Save (or overwrite) the image data URL for a slide. */
export async function putImage(id: string, dataUrl: string): Promise<void> {
  if (!isAvailable()) return;
  await runTransaction("readwrite", (store) => store.put(dataUrl, id));
}

/** Remove a slide's image (e.g. when the slide is deleted). */
export async function deleteImage(id: string): Promise<void> {
  if (!isAvailable()) return;
  await runTransaction("readwrite", (store) => store.delete(id));
}

/** Load every stored image as a map of slide id -> data URL. */
export async function getAllImages(): Promise<Record<string, string>> {
  if (!isAvailable()) return {};
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const keysRequest = store.getAllKeys();
    const valuesRequest = store.getAll();
    tx.oncomplete = () => {
      db.close();
      const keys = keysRequest.result as IDBValidKey[];
      const values = valuesRequest.result as string[];
      const out: Record<string, string> = {};
      keys.forEach((key, index) => {
        out[String(key)] = values[index];
      });
      resolve(out);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

/** Drop any stored images whose slide ids are no longer present. */
export async function pruneImages(keepIds: string[]): Promise<void> {
  if (!isAvailable()) return;
  const keep = new Set(keepIds);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const keysRequest = store.getAllKeys();
    keysRequest.onsuccess = () => {
      for (const key of keysRequest.result as IDBValidKey[]) {
        if (!keep.has(String(key))) {
          store.delete(key);
        }
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
