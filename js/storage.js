/* storage.js — IndexedDB wrapper for CardScan contacts.
   Everything lives on-device. No network calls are made here. */

const CardStore = (() => {
  const DB_NAME = 'cardscan';
  const DB_VERSION = 1;
  const STORE = 'contacts';
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(mode) {
    const db = await openDB();
    const t = db.transaction(STORE, mode);
    return { t, store: t.objectStore(STORE) };
  }

  function uid() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  async function saveContact(contact) {
    const { t, store } = await tx('readwrite');
    if (!contact.id) contact.id = uid();
    if (!contact.createdAt) contact.createdAt = Date.now();
    contact.updatedAt = Date.now();
    return new Promise((resolve, reject) => {
      const req = store.put(contact);
      req.onsuccess = () => resolve(contact);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll() {
    const { store } = await tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async function getById(id) {
    const { store } = await tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteContact(id) {
    const { t, store } = await tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function clearAll() {
    const { t, store } = await tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function estimateUsage() {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota };
    }
    return null;
  }

  /** Very rough duplicate check: same phone digits or same email. */
  async function findPossibleDuplicate(contact) {
    const all = await getAll();
    const phoneDigits = (contact.mobile || '').replace(/\D/g, '').slice(-10);
    const email = (contact.email || '').toLowerCase().trim();
    return all.find(c => {
      if (c.id === contact.id) return false;
      const cPhone = (c.mobile || '').replace(/\D/g, '').slice(-10);
      const cEmail = (c.email || '').toLowerCase().trim();
      return (phoneDigits && cPhone === phoneDigits) || (email && cEmail === email);
    }) || null;
  }

  return { saveContact, getAll, getById, deleteContact, clearAll, estimateUsage, findPossibleDuplicate };
})();
