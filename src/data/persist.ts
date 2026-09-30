import type { Dataset } from './schema'

// The dataset can run to tens of thousands of rows, beyond localStorage's quota,
// so it lives in IndexedDB. Failure is non-fatal: the app just starts empty.

const DB = 'vendor-performance'
const STORE = 'dataset'
const KEY = 'current'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveDataset(ds: Dataset | null): Promise<void> {
  try {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      if (ds) tx.objectStore(STORE).put(ds, KEY)
      else tx.objectStore(STORE).delete(KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    /* storage blocked: the dataset stays in memory for this session */
  }
}

export async function loadDataset(): Promise<Dataset | null> {
  try {
    const db = await open()
    const ds = await new Promise<Dataset | null>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve((req.result as Dataset) ?? null)
      req.onerror = () => reject(req.error)
    })
    db.close()
    return ds
  } catch {
    return null
  }
}
