import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';

// Load env vars from .env.local
const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};

const projectId = get('FIREBASE_PROJECT_ID');
const clientEmail = get('FIREBASE_CLIENT_EMAIL');
const privateKey = get('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n');

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket: get('FIREBASE_STORAGE_BUCKET') || 'akarapol798.firebasestorage.app',
  });
}

const db = getFirestore();
const auth = getAuth();

console.log('projectId:', projectId);
console.log('clientEmail:', clientEmail);
console.log('privateKey starts:', privateKey.slice(0, 30) + '...');

// List collections
const cols = await db.listCollections();
console.log('\nCOLLECTIONS:');
for (const c of cols) console.log(' -', c.id);

// Members
try {
  const membersSnap = await db.collection('members').limit(100).get();
  console.log('\nMEMBERS count (up to 100):', membersSnap.size);
  membersSnap.forEach(d => {
    const m = d.data();
    console.log(`  [${d.id}] ${m.memberCode || '?'} | ${m.name} | pos=${m.positionId} role=${m.role} status=${m.status} | FYC=${m.personalFYC} COM=${m.personalCOM}`);
  });
} catch (e) { console.log('members err:', e.message); }

// Auth users
try {
  const list = await auth.listUsers(100);
  console.log('\nAUTH USERS:', list.users.length);
  for (const u of list.users) {
    console.log(`  [${u.uid}] ${u.email} | verified=${u.emailVerified} | disabled=${u.disabled} | providers=${u.providerData.map(p=>p.providerId).join(',')}`);
  }
} catch (e) { console.log('auth err:', e.message); }

process.exit(0);
