// Local database manager using IndexedDB for binary blob storage

const DB_NAME = 'SnapVaultDB';
const DB_VERSION = 1;
const STORE_NAME = 'captures';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (e) => {
      resolve(e.target.result);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

async function saveCapture(capture) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    // Save capture item
    const request = store.put(capture);
    
    request.onsuccess = () => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

async function getCapture(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = (e) => {
      db.close();
      resolve(e.target.result);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

async function getAllCaptures() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (e) => {
      db.close();
      const results = e.target.result || [];
      // Sort captures descending by timestamp
      results.sort((a, b) => b.timestamp - a.timestamp);
      resolve(results);
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

async function deleteCapture(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}

async function clearAllCaptures() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };

    request.onerror = (e) => {
      reject(e.target.error);
    };
  });
}
