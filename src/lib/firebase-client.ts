import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

// อ่านคีย์จาก env ก่อน (Vercel: NEXT_PUBLIC_FIREBASE_API_KEY)
// รองรับชื่อสำรอง FIREBASE_WEB_API_KEY และค่าดีฟอลต์ใน firebase-web-config.json
import webDefaults from '@/firebase-web-config.json';

function pickEnv(name: string, fallback: string): string {
  const v = (process.env as any)?.[name];
  return (typeof v === 'string' && v && !v.includes('...') && v !== '***') ? v : fallback;
}

const apiKey = pickEnv('NEXT_PUBLIC_FIREBASE_API_KEY',
  pickEnv('FIREBASE_WEB_API_KEY', (webDefaults as any)?.apiKey || ''));

const firebaseConfig = {
  apiKey,
  authDomain: pickEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'akarapol798.firebaseapp.com'),
  projectId: pickEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'akarapol798'),
  storageBucket: pickEnv('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', 'akarapol798.firebasestorage.app'),
  messagingSenderId: pickEnv('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', '99602641954'),
  appId: pickEnv('NEXT_PUBLIC_FIREBASE_APP_ID', '1:99602641954:web:6f39321bcf4ec5aeed867b'),
  measurementId: '',
};

// เหตุผลที่ login ล้มเหลว — ให้หน้า UI แสดงข้อความภาษาไทยแทน error ดิบของ Firebase
export const firebaseConfigError: string | null =
  !apiKey || apiKey === '***' || apiKey.includes('«') || apiKey.includes('...')
    ? 'ยังไม่ได้ตั้งค่า Firebase Web API Key — ดูวิธีแก้ด้านล่าง'
    : null;

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

if (typeof window !== 'undefined' && !firebaseConfigError) {
  try {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch {
    auth = undefined;
    db = undefined;
  }
}

export { app, auth, db };
export default app!;
