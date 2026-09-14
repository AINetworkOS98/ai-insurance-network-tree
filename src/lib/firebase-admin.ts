import { initializeApp, cert, getApps, getApp, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';

// Lazy init — ป้องกันไม่ให้ initializeApp ทำงานตอน build (collect page data)
let _db: Firestore | null = null;
let _storage: Storage | null = null;

function resolveServiceAccount(): ServiceAccount {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase service account ไม่ครบ — ตั้ง FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY'
    );
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n'),
  };
}

function getAppInstance() {
  if (getApps().length) return getApp();
  return initializeApp({
    credential: cert(resolveServiceAccount()),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'akarapol798.firebasestorage.app',
  });
}

export function getAdminApp() {
  return getAppInstance();
}

export function getDb(): Firestore {
  if (!_db) {
    _db = getFirestore(getAppInstance());
  }
  return _db;
}

export function getStorageBucket(): Storage {
  if (!_storage) {
    _storage = getStorage(getAppInstance());
  }
  return _storage;
}

export const db = getDb;
export const storage = getStorageBucket;
export const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'akarapol798.firebasestorage.app';
