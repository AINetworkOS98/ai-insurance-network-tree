import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const get = (k) => {
  const m = env.match(new RegExp('^' + k + '=(.*)$', 'm'));
  return m ? m[1].trim() : '';
};
if (!getApps().length) {
  initializeApp({ credential: cert({ projectId: get('FIREBASE_PROJECT_ID'), clientEmail: get('FIREBASE_CLIENT_EMAIL'), privateKey: get('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n') }), storageBucket: get('FIREBASE_STORAGE_BUCKET') || 'akarapol798.firebasestorage.app' });
}
const db = getFirestore();

for (const col of ['memberAccess', 'applications', 'auditLogs', 'resetCodes']) {
  try {
    const snap = await db.collection(col).limit(50).get();
    console.log('\n=== ' + col + ' (count:' + snap.size + ') ===');
    snap.forEach(d => {
      const data = d.data();
      const keys = Object.keys(data).join(',');
      console.log(`  [${d.id}] keys=[${keys}]`);
      console.log('    ', JSON.stringify(data).slice(0, 500));
    });
  } catch (e) { console.log(col + ' err:', e.message); }
}
process.exit(0);
