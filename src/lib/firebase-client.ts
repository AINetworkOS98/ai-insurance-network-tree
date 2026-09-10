import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSy...AZ0k",
  authDomain: "akarapol798.firebaseapp.com",
  projectId: "akarapol798",
  storageBucket: "akarapol798.firebasestorage.app",
  messagingSenderId: "99602641954",
  appId: "1:99602641954:web:e1a0af358471c434ed867b",
  measurementId: "",
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

if (typeof window !== 'undefined') {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { app, auth, db };
export default app!;