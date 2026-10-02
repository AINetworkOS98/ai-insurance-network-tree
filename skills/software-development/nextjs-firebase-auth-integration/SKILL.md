---name: nextjs-firebase-auth-integration
description: Connect Next.js admin app to shared Firebase Auth + Firestore DB (project akarapol798). Real login via Google OAuth, email/password with idToken verification, Firestore API endpoints for members/income/positions.
version: 0.1.0
author: Akarapol, Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [firebase, nextjs, admin, auth, firestore]
    related_skills: [hermes-agent-skill-authoring]
---# Next.js Firebase Admin Integration Skill

## Overview

This skill provides the complete setup to connect a Next.js app (Hermes AI Insurance Network Tree) to a shared Firebase project (`projectId: akarapol798`). It enables:

- Real authentication via Firebase Auth (Google OAuth + email/password)
- Real Firestore database access (members, policies, commissions, positions, income summaries)
- Admin API endpoints reading live data
- Commission calculation engine ported from OS app
- Admin dashboard showing actual member data and income/position stats

**This skill is specific to the ai-insurance-network-tree project.** The shared Firebase project `akarapol798` is also used by `ai-insurance-network-os` at `https://ai-insurance-network-os.vercel.app/recruit_agent`.

## When to Use

- User asks to connect two Vercel-deployed Next.js apps to share a Firebase Firestore database
- User wants real authentication instead of demo stubs in `/api/auth/login`
- User wants admin dashboard with live member data (not hardcoded demo values)
- User wants commission cutting / income calculation from Firestore data
- User wants position management / tree placement with real DB data

**Do NOT use this skill** when:
- The projects need to use separate Firebase projects
- Hardcoded/demo data is preferred for a temporary demo

## Prerequisites

### Environment Variables in `.env.local`

Add to `C:\Users\User\ai-insurance-network-tree\.env.local`:

```env
# Firebase Admin (already present from service account)
FIREBASE_PROJECT_ID=akarapol798
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@akarapol798.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=private_key_here_with_newlines
FIREBASE_STORAGE_BUCKET=akarapol798.firebasestorage.app

# Firebase Client config (merged from OS firebase-applet-config.json)
FIREBASE_API_KEY=AIzaSy...AZ0k
FIREBASE_AUTH_DOMAIN=akarapol798.firebaseapp.com
FIREBASE_PROJECT_ID=akarapol798  # duplicate, OK
FIREBASE_STORAGE_BUCKET=akarapol798.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=99602641954
FIREBASE_APP_ID=1:99602641954:web:e1a0af358471c434ed867b

# Other
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=change-this-to-a-real-secret
```

### Required Files (already in project)

- `src/firebase-web-config.json` — client config from OS `firebase-applet-config.json` (created in this session)
- `src/lib/firebase-admin.ts` — Admin SDK initialized with service account (created earlier)
- `src/lib/firebase-client.ts` — Client SDK (created in this session)
- `src/lib/types.ts` — shared TypeScript interfaces (created in this session)
- `src/lib/compensationRules.ts` — commission calculation rules (ported from OS)
- `src/lib/compensationPlanVersion.ts` — plan version config (ported from OS)

### npm Packages

```bash
npm install firebase@^11 firebase-admin@14.3.0 @prisma/client next@14
# Already installed: firebase-admin@14.3.0, @prisma/client, next@14
```

## How to Run

### 1. Login API (`src/app/api/auth/login/route.ts`)

The `/api/auth/login` endpoint now accepts a Firebase `idToken` from the client and verifies it against the Admin SDK, then looks up the member's Firestore data.

**POST body:**
```json
{
  "idToken": "firebase-id-token-from-client"
}
```

**or for email/password fallback:**
```json
{
  "email": "user@example.com",
  "password": "password"
}
```

**Responses on success:**
- `200` with `{ ok: true, token: 'jwt-custom-token', role: 'admin'|'member', name: string, memberId: string, email: string }`
- Sets `auth_token` cookie (httpOnly, 7 days)
- Also returns `memberId`, `role`, `name`, `email`

**Key code flow:**
1. Verify `idToken` via `getAuth().verifyIdToken(idToken)`
2. Look up `memberAccess` doc by UID → get `memberId`
3. Look up `members` doc by `memberId` → get role, name, positionId
4. Mint custom JWT via `signToken({ uid, email, memberId, role, name })`
5. Set cookie and return response

### 2. Login Page (`src/app/login/page.tsx`)

The login page now uses Firebase Client SDK for authentication:

- **Google OAuth**: `signInWithPopup(auth, googleProvider)` → gets `idToken` → calls `/api/auth/login`
- **Email + Password**: `signInWithEmailAndPassword(auth, email, password)` → gets `idToken` → calls `/api/auth/login`
- On success: redirects to `/dashboard` (or `?redirect=...` parameter)
- On failure: displays Firebase error message in Thai

### 3. Firestore API Endpoints

Create these endpoints under `src/app/api/`:

#### a) `/api/members/route.ts` — List all members
```typescript
GET: Returns all members from Firestore `members` collection
```
Used for admin member list, tree visualization, role assignments.

#### b) `/api/members/[memberId]/route.ts` — Single member detail
```typescript
GET: Return member doc by ID
PATCH: Update member fields (role, status, position)
```

#### c) `/api/income/summary/route.ts` — Income summary (REWRITTEN)
```typescript
POST: Accepts { memberId, positionId, personalFYC, teamFYC, personalCOM, teamCOM, renewalPremium, firstYearPremium }
Returns: complete breakdown via calculateTotalIncome from ported engine
```

#### d) `/api/tree/positions/route.ts` — Tree positions
```typescript
GET: Returns all TreePosition docs from Firestore
POST: Places member in tree slot (reads available-slots logic from lib/positions.ts)
GET /available: Returns available binary tree slots
```

### 4. Admin Page Update (`src/app/admin/page.tsx`)

Replace hardcoded demo cards with real Firestore data:

- **Member approval cards**: Read pending applications from `applications` collection
- **Income stats**: Fetch real income summaries from Firestore
- **Audit log**: Read actual auditLogs collection entries
- **Permission matrix**: Show dynamic RBAC from Firestore RolePermission docs

### 5. Commission Calculation (Ported from OS)

The calculation engine from `ai-insurance-network-os` is ported as:

- `src/lib/compensationRules.ts` — DEFAULT_RULES_2021 + INITIAL_PLAN_VERSION
- `src/lib/positions.ts` — binary tree position management
- `src/lib/income.ts` — income summary aggregation using calculateTotalIncome
- New endpoints: `/api/income/summary/` takes calculation input, returns full breakdown

## Quick Reference

| Action | Endpoint / Command | Description |
|--------|---|---|
| Login with Google | `/api/auth/login` + Google OAuth | Firebase Auth → Firestore member lookup → custom JWT |
| Login with email/password | `/api/auth/login` + `{email, password}` | Client SDK → idToken → verification |
| List members | `GET /api/members` | All docs from `members` collection |
| Member detail | `GET /api/members/:id` | Single member by ID |
| Income summary | `POST /api/income/summary` | Full breakdown via calculation engine |
| Tree positions | `GET /api/tree/positions` | All tree positions from Firestore |
| Available slots | `GET /api/tree/available-slots` | Binary tree slot availability |
| Create application | `POST /api/applications` | New recruit application → Firestore |

## Pitfalls

1. **idToken expired** — Firebase ID tokens expire after 1 hour. Client must get fresh token on each login.
2. **Member not in Firestore** — If user exists in Firebase Auth but has no `memberAccess` or `members` doc, return 404 "ไม่พบข้อมูลสมาชิก" not a generic error.
3. **Service account scope** — Admin SDK needs `cloudfire basestore` scope; ensure `FIREBASE_PRIVATE_KEY` has proper newlines (`\n` not `\\n`).
4. **Client config mismatch** — `FIREBASE_API_KEY` / `FIREBASE_AUTH_DOMAIN` must match the project (`akarapol798`). If client config points to a different project, auth will fail silently.
5. **Prisma vs Firestore dual-write** — Tree project uses Prisma/PostgreSQL for some data + Firestore for others. Ensure you know which source of truth to use for each operation (e.g., tree structure = Prisma, member status = Firestore).

## Verification

To verify the skill works end-to-end:

1. `cd ~/ai-insurance-network-tree && npm run dev` — start dev server
2. Open `http://localhost:3000/login`
3. Click "เข้าสู่ระบบด้วย Google" — should authenticate and redirect to `/dashboard`
4. Visit `/admin` — should show real member data from Firestore (not demo cards)
5. Try `/api/income/summary` with POST body using real member data — should return valid commission breakdown
6. Check `/api/tree/available-slots` — should return actual slot data from DB
7. Verify member data matches what's in OS app at `https://ai-insurance-network-os.vercel.app/recruit_agent`

### Test Script

Run this Node script to verify all endpoints:

```bash
node -e "
const { getDb } = require('./src/lib/firebase-admin');
const db = getDb();

// 1. Check members collection
const members = await db.collection('members').get();
console.log('Members count:', members.size);

// 2. Check memberAccess
const memberAccess = await db.collection('memberAccess').limit(3).get();
console.log('Sample memberAccess:', memberAccess.docs.map(d => ({ uid: d.id, data: d.data() })));

// 3. Check applications
const apps = await db.collection('applications').limit(3).get();
console.log('Sample applications:', apps.docs.map(d => ({ id: d.id, data: d.data() })));

// 4. Check auditLogs count
const logs = await db.collection('auditLogs').limit(5).get();
console.log('Sample audit logs:', logs.docs.map(d => ({ id: d.id, data: d.data() })));

// 5. Test calculateTotalIncome with sample data
const { calculateTotalIncome } = require('./src/lib/calculationEngine');
const result = calculateTotalIncome({
  memberId: 'test',
  positionId: 'agent',
  personalFYC: 50000,
  teamFYC: 500000,
  personalCOM: 10000,
  teamCOM: 100000,
  firstYearPremium: 100000,
  renewalPremium: 50000,
});
console.log('Total income result:', JSON.stringify(result, null, 2));
"
"