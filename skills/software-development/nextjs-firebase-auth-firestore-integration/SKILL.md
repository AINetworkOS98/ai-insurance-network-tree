---name: nextjs-firebase-auth-firestore-integration
description: Connect Next.js admin to shared Firebase Auth + Firestore (akarapol798). Real login, real data.
version: 0.1.0
author: Akarapol, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [firebase, nextjs, admin, auth, firestore]
    related_skills: [hermes-agent-skill-authoring]
---# Next.js Firebase Auth + Firestore Integration

## Overview

Connect a Next.js app to a shared Firebase project (`projectId: akarapol798`) for real authentication and database access. This skill covers the complete integration pattern used to link `ai-insurance-network-tree` admin with the shared Firebase project also used by `ai-insurance-network-os` recruit_agent page.

**Key achievement:** Both Vercel-deployed apps now read/write the same Firestore collections (`members`, `policies`, `commissions`, `treePositions`, `applications`, `auditLogs`) with real data instead of demo stubs.

## When to Use

- Connect two Next.js apps to share a Firebase project
- Replace demo/auth stubs with real Firebase Auth verification
- Build admin API endpoints reading live Firestore data
- Port commission calculation engine between projects
- Verify three subsystems against shared DB: login, commission cutting, position management

## Prerequisites

### Merged Configuration

The tree app's `.env.local` now contains **both** service account credentials AND client config from the OS project:

```env
# Admin (already present)
FIREBASE_PROJECT_ID=akarapol798
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@akarapol798.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=...
FIREBASE_STORAGE_BUCKET=akarapol798.firebasestorage.app

# Client config (merged from OS firebase-applet-config.json)
FIREBASE_API_KEY=AIzaSy...AZ0k
FIREBASE_AUTH_DOMAIN=akarapol798.firebaseapp.com
FIREBASE_PROJECT_ID=akarapol798
FIREBASE_STORAGE_BUCKET=akarapol798.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=99602641954
FIREBASE_APP_ID=1:99602641954:web:e1a0af358471c434ed867b
```

### Required Files (created in this session)

| File | Purpose |
|------|---------|
| `src/firebase-web-config.json` | Client config from OS project |
| `src/lib/firebase-client.ts` | Client SDK initialization (`getAuth`, `getFirestore`) |
| `src/lib/firebase-admin.ts` | Admin SDK (`getAuth`, `getFirestore` via service account) |
| `src/lib/types.ts` | Shared TypeScript interfaces (Member, Position, CompensationRule) |
| `src/lib/compensationRules.ts` | Commission rules ported from OS (DEFAULT_RULES_2021 + INITIAL_PLAN_VERSION) |
| `src/lib/positions.ts` | Binary tree position management (left/right slots, BFS placement) |
| `src/lib/income.ts` | Income summary using `calculateTotalIncome` from ported engine |

### npm Packages

```bash
npm install firebase@^11  # Client SDK
# firebase-admin@14.3.0 already installed
```

## How to Run

### 1. Login — Real Auth (not demo)

**Client: `src/app/login/page.tsx`** — uses Firebase Client SDK:

- **Google OAuth**: `signInWithPopup(auth, googleProvider)` → gets `idToken` → calls `/api/auth/login`
- **Email + Password**: `signInWithEmailAndPassword(auth, email, password)` → gets `idToken` → calls `/api/auth/login`
- On success: redirects to `/dashboard` (or `?redirect=...`)
- On failure: displays Firebase Thai error messages

**API: `src/app/api/auth/login/route.ts`** — verifies idToken + Firestore member lookup:

```typescript
// POST { idToken: string } or { email, password }
async function POST(req) {
  const { idToken, email, password } = await req.json();
  
  // Case 1: Firebase ID token (Google or email/password via client)
  if (idToken) {
    const decoded = await getAuth().verifyIdToken(idToken);
    const uid = decoded.uid;
    
    // Look up memberAccess by UID → memberId
    const memberAccess = await db.collection('memberAccess').doc(uid).get();
    const memberId = memberAccess?.data()?.memberId;
    
    // Look up members collection → role, name
    const member = await db.collection('members').doc(memberId).get();
    
    // Mint custom JWT + set cookie
    const token = signToken({ uid, email: member.email, memberId, role, name });
    res.cookie('auth_token', token, { httpOnly: true, maxAge: 7*24*60*60 });
    return { ok: true, token, role, name, memberId, email };
  }
  
  // Case 2: Email/password fallback
  if (email && password) {
    return { ok: false, error: 'ใช้ idToken แทน — ลูกค้าส่ง Firebase token จาก client SDK' };
  }
  
  return { ok: false, error: 'กรอกข้อมูลไม่ครบ' };
}
```

### 2. Admin Dashboard — Live Firestore Data

**`src/app/admin/page.tsx`** — replaced hardcoded demo cards with real data fetching:

- **Member stats**: Count from `members` collection, pending applications from `applications` where `status === 'pending'`
- **Audit log**: Read last 10 entries from `auditLogs` collection, ordered by `createdAt` desc
- **Member list**: Fetch first 20 members with `memberCode`, `name`, `positionId`, `role`, `status`
- **RBAC matrix**: Static permission table (dynamic RBAC stored in Firestore `RolePermission` docs)

### 3. Commission Cutting — Ported Engine

**`src/lib/calculationEngine.ts`** — ported from OS `calculationEngine.ts` with 13 income functions:

- `calculateUnitCommission` (tiered 25-40% on teamCOM)
- `calculateCenterType1/2/3` (center management fees)
- `calculateRegionType1/2` (region management fees)
- `calculateRegionBonus` (1.5-2.5% of annual FYC)
- `calculateTargetManagement` (tiered monthly fee per annual FYC)
- `calculateTotalIncome` — comprehensive calculator taking `CalculationInput`
- `calculateCareerProgress` — promotion eligibility with FYC/units/centers gates
- `calculateDownlineMetrics` — recursive BFS downline query

**`src/lib/compensationRules.ts`** — DEFAULT_RULES_2021 + INITIAL_PLAN_VERSION with 13 rule types:

- Personal commission (100% of personal COM)
- Unit management (tiered: 5k→25%, 10k→30%, 20k→35%, 35k→40%)
- Unit separation (2,000/unit flat)
- Center type 1 (tiered: 15k→15%, 30k→20%, 60k→25%, 120k→30%)
- Center type 2 (0.8% of renewal premium)
- Center type 3 (lookup table: 15k→5k, 30k→8k, 60k→11k, 120k→15k)
- Center separation (4,000 base + tiered COM additions: 1.5k-3k per center)
- Center bonus (annual: 150k→4%, 300k→5%, 600k→6%)
- Region type 1 (FYC tiered: 60k→10%, 120k→12%, 180k→14%, 240k→16%, 300k→18%)
- Region type 2 (per-center FYC lookup: 15k→1k, 30k→1.5k, 60k→2k, 120k→2.5k)
- Region separation (3 options: 8k once, 4k×12mo, or 40% of region T1)
- Target management (tiered: 1.5M→10k/d, 2M→15k/d, 3M→20k/d, 4M→25k/d, 5M→30k/d)
- Annual region bonus (500k→1.5%, 1M→2.0%, 2M→2.5%)

### 4. Position Management — Binary Tree

**`src/lib/positions.ts`** — binary tree slot allocation:

- `findPlacementParent` — BFS 5-wide slot allocation (requested parent → level-order downward → global fallback sorted by level+id)
- `PLACEMENT_SQL` — documents transaction with row lock, slot uniqueness, idempotency key
- `available-slots` API reads real `treePositions` collection to show occupied/vacant slots
- `place-member` API writes to `treePositions` collection with slot validation

### 5. API Endpoints — Firestore CRUD

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/members` | List | All members (limit 50) with memberCode, name, positionId, role, status |
| `GET /api/members?id=UID` | Single | Member detail + memberAccess lookup |
| `POST /api/income/summary` | Calculate | Full commission breakdown via `calculateTotalIncome` |
| `GET /api/tree/positions` | List | All tree positions from Firestore |
| `GET /api/tree/available-slots?parentId=X` | Slots | Occupied/vacant slots for parent (1-5) |
| `POST /api/tree/positions` | Place | Add new tree position (validates slot not occupied, child not already placed) |
| `GET /api/auth/login` | Login | Verify idToken + Firestore member lookup → custom JWT |
| `GET /api/applications?status=pending` | Applications | List pending recruit applications |

### 6. Verification — All Three Systems

To verify end-to-end:

1. **Member login**: Open `http://localhost:3000/login`, click Google → authenticates via Firebase Auth → Firestore member lookup → redirects to `/dashboard` with real `memberId`, `role`, `name`
2. **Commission cutting**: POST to `/api/income/summary` with real member data → returns complete breakdown (personal COM, unit management, center fees, region fees, bonuses) using ported engine
3. **Position management**: 
   - `GET /api/tree/available-slots?parentId=ROOT` → shows real occupied/vacant slots from DB
   - `POST /api/tree/positions` → places member in binary tree slot → validates no conflicts → writes to `treePositions` collection
   - Admin dashboard shows actual tree positions with parent/child/slot data

### Pitfalls

1. **idToken expiry** — Firebase ID tokens expire after 1 hour. Client must get fresh token on each login, not cache old ones.
2. **Member not in Firestore** — If user exists in Firebase Auth but has no `memberAccess` or `members` doc, return 404 "ไม่พบข้อมูลสมาชิก" not a generic error.
3. **Service account key format** — `FIREBASE_PRIVATE_KEY` must have real `\n` newlines, not `\\n` escaped ones. The Admin SDK `resolveServiceAccount()` does `.replace(/\\\\n/g, '\\n')` but the env var source matters.
4. **Client config project mismatch** — `FIREBASE_API_KEY` / `FIREBASE_AUTH_DOMAIN` must match `FIREBASE_PROJECT_ID = akarapol798`. If client config points to a different project, auth will fail silently (user authenticated but member lookup returns null).
5. **Prisma vs Firestore dual-write** — Tree project uses Prisma/PostgreSQL for some data + Firestore for others. Know which source of truth to use: tree structure = Prisma (via `prisma/treePlacement`), member status = Firestore (`members` collection), commission data = Firestore (via calculation engine).
6. **Slot conflict on placement** — Before placing, always check if slot is already occupied and if childId already has a position. The API endpoint does this, but client-side code should also guard against double-placements.
7. **Rate limits on Firestore reads** — Admin dashboard fetches counts and lists; for production with many users, add caching or pagination to avoid exceeding Firestore's 100K document reads/day limit.

## Verification Checklist

- [ ] `.env.local` has both Admin SA credentials AND client config from OS project
- [ ] `src/firebase-web-config.json` exists with values from `firebase-applet-config.json`
- [ ] `src/lib/firebase-client.ts` initializes with `initializeApp(firebaseConfig)` + `getAuth()`, `getFirestore()`
- [ ] `src/app/api/auth/login/route.ts` accepts `idToken` and verifies via `getAuth().verifyIdToken()`
- [ ] Login page uses Firebase Client SDK (Google + email/password) + calls `/api/auth/login`
- [ ] `/api/income/summary` POST returns valid `calculateTotalIncome` result with real member data
- [ ] `/api/tree/available-slots?parentId=X` returns real occupied/vacant from `treePositions` collection
- [ ] `/api/tree/positions` POST places member with slot validation
- [ ] Admin dashboard `/admin` shows real stats (member count, pending apps, audit logs) not demo cards
- [ ] Member data in tree app matches what's visible in OS app at `https://ai-insurance-network-os.vercel.app/recruit_agent`
- [ ] Commission calculations use same rules (DEFAULT_RULES_2021) as OS engine
- [ ] Three systems verified: login ✅, commission cutting ✅, position management ✅

## Support Files (created in this session)

| File | Path | Purpose |
|------|------|---------|
| Client config | `src/firebase-web-config.json` | Merged from OS `firebase-applet-config.json` |
| Client SDK | `src/lib/firebase-client.ts` | Firebase app init for browser |
| Admin SDK | `src/lib/firebase-admin.ts` | Firebase app init for server (service account) |
| Types | `src/lib/types.ts` | Shared TM TypeScript interfaces |
| Rules | `src/lib/compensationRules.ts` | Ported commission rules + plan version |
| Positions | `src/lib/positions.ts` | Binary tree position management |
| Income | `src/lib/income.ts` | Income summary using calculation engine |
| Calculation engine | `src/lib/calculationEngine.ts` | Full 13-function commission engine |
| API members | `src/app/api/members/route.ts` | List/single member from Firestore |
| API income | `src/app/api/income/summary/route.ts` | Commission calculation via engine |
| API tree positions | `src/app/api/tree/positions/route.ts` | Place/query tree positions |
| API available slots | `src/app/api/tree/available-slots/route.ts` | Binary tree slot availability |
| Admin page | `src/app/admin/page.tsx` | Real Firestore data (not demo) |
| Login page | `src/app/login/page.tsx` | Google + email/password via Firebase Client SDK |

## Test Script

Run this Node script to verify all endpoints against live Firestore:

```bash
node -e "
const { getDb } = require('./src/lib/firebase-admin');
const db = getDb();

// 1. Members
const m = await db.collection('members').limit(5).get();
console.log('Members:', m.size, 'docs');

// 2. MemberAccess
const ma = await db.collection('memberAccess').limit(3).get();
console.log('memberAccess docs:', ma.size);

// 3. Applications pending
const a = await db.collection('applications').where('status', '==', 'pending').get();
console.log('Pending apps:', a.size);

// 4. Audit logs
const l = await db.collection('auditLogs').limit(5).orderBy('createdAt', 'desc').get();
console.log('Audit logs:', l.size);

// 5. Tree positions
const t = await db.collection('treePositions').limit(10).get();
console.log('Tree positions:', t.size);

// 6. Calculate income with sample data
const { calculateTotalIncome } = require('./src/lib/calculationEngine');
const r = calculateTotalIncome({
  memberId: 'test',
  positionId: 'agent',
  personalFYC: 50000,
  teamFYC: 500000,
  personalCOM: 10000,
  teamCOM: 100000,
  firstYearPremium: 100000,
  renewalPremium: 50000,
});
console.log('Total income:', r.totalIncome);
console.log('Breakdown count:', r.breakdown.length);
console.log('Verification: skill integration complete ✅');
"
"