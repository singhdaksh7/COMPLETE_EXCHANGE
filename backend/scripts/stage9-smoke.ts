/**
 * Stage 9 — Production readiness smoke test.
 *
 * Drives REAL HTTP against the running public (:4000) and admin (:4001) servers
 * to verify the Stage 9 surface is wired and existing Stage 8 routes still
 * respond. It NEVER hardcodes secrets.
 *
 * Two modes:
 *   1. Unauthenticated (default): asserts public probes return 200 and every
 *      protected admin route EXISTS — i.e. returns 401 (auth required), NOT 404
 *      (missing route). This is enough to catch a broken mount/regression.
 *   2. Authenticated (optional): if SMOKE_ADMIN_EMAIL + SMOKE_ADMIN_PASSWORD
 *      (+ SMOKE_ADMIN_TOTP when TOTP is enabled) are present in the environment,
 *      it logs in and asserts each protected route returns 200.
 *
 * Requires: `npm run dev` (:4000) and `npm run dev:admin` (:4001) running.
 *
 *   npx tsx scripts/stage9-smoke.ts
 *   SMOKE_ADMIN_EMAIL=... SMOKE_ADMIN_PASSWORD=... SMOKE_ADMIN_TOTP=... npx tsx scripts/stage9-smoke.ts
 */
const API = process.env.SMOKE_API_BASE ?? 'http://localhost:4000/api/v1';
const ADMIN = process.env.SMOKE_ADMIN_BASE ?? 'http://localhost:4001/admin/v1';
const ROOT_API = API.replace(/\/api\/v1$/, '');
const ROOT_ADMIN = ADMIN.replace(/\/admin\/v1$/, '');

let passed = 0;
let failed = 0;

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(msg);
}
function pass(msg: string): void {
  passed += 1;
  log(`  ✓ ${msg}`);
}
function fail(msg: string): void {
  failed += 1;
  log(`  ✗ ${msg}`);
}

interface CallResult {
  status: number;
  body: unknown;
}
async function call(url: string, token?: string, method = 'GET', body?: unknown): Promise<CallResult> {
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON */
    }
    return { status: res.status, body: parsed };
  } catch (err) {
    return { status: 0, body: { error: String(err) } };
  }
}

/** Assert a public probe returns 200. */
async function expectPublicOk(url: string, label: string): Promise<void> {
  const r = await call(url);
  if (r.status === 200) pass(`${label} → 200`);
  else fail(`${label} → expected 200, got ${r.status}`);
}

/** Assert a protected route EXISTS: 200 when authed, else 401 (never 404). */
async function expectProtected(url: string, label: string, token?: string): Promise<void> {
  const r = await call(url, token);
  if (token) {
    if (r.status === 200) pass(`${label} → 200 (authed)`);
    else fail(`${label} → expected 200 (authed), got ${r.status}`);
  } else {
    if (r.status === 401) pass(`${label} → 401 (route exists, auth required)`);
    else if (r.status === 404) fail(`${label} → 404 (ROUTE MISSING)`);
    else fail(`${label} → expected 401, got ${r.status}`);
  }
}

async function maybeLogin(): Promise<string | undefined> {
  const email = process.env.SMOKE_ADMIN_EMAIL;
  const password = process.env.SMOKE_ADMIN_PASSWORD;
  const totp = process.env.SMOKE_ADMIN_TOTP ?? '';
  if (!email || !password) {
    log('\nNo SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD set — running UNAUTHENTICATED route-existence checks.');
    log('(Set them, plus SMOKE_ADMIN_TOTP if TOTP is enabled, to verify 200 responses.)');
    return undefined;
  }
  const r = await call(`${ADMIN}/auth/login`, undefined, 'POST', { email, password, totp });
  const token = (r.body as { data?: { tokens?: { accessToken?: string } } })?.data?.tokens?.accessToken;
  if (r.status === 200 && token) {
    pass('admin login → 200 (token acquired)');
    return token;
  }
  fail(`admin login → ${r.status} (could not acquire token; falling back to unauthenticated checks)`);
  return undefined;
}

async function main(): Promise<void> {
  log('Stage 9 smoke test');
  log(`  public: ${API}`);
  log(`  admin:  ${ADMIN}`);

  log('\n[1] Public health probes');
  await expectPublicOk(`${ROOT_API}/health`, 'GET /health (public)');
  await expectPublicOk(`${ROOT_API}/ready`, 'GET /ready (public)');
  await expectPublicOk(`${ROOT_ADMIN}/health`, 'GET /health (admin)');
  await expectPublicOk(`${ROOT_ADMIN}/ready`, 'GET /ready (admin)');

  log('\n[2] Admin login route exists');
  // A bare GET on the login route should NOT be 404 (it's a POST route).
  {
    const r = await call(`${ADMIN}/auth/login`, undefined, 'POST', {});
    if (r.status !== 404) pass(`POST /auth/login exists (status ${r.status})`);
    else fail('POST /auth/login → 404 (ROUTE MISSING)');
  }

  const token = await maybeLogin();

  log('\n[3] Stage 9 admin routes');
  await expectProtected(`${ADMIN}/system/readiness`, 'GET /system/readiness', token);
  await expectProtected(`${ADMIN}/system/backup-status`, 'GET /system/backup-status', token);
  await expectProtected(`${ADMIN}/system/monitoring`, 'GET /system/monitoring', token);
  await expectProtected(`${ADMIN}/system/guardrails`, 'GET /system/guardrails', token);
  await expectProtected(`${ADMIN}/system/go-live-readiness`, 'GET /system/go-live-readiness (Stage 10)', token);
  await expectProtected(`${ADMIN}/security/audit-review`, 'GET /security/audit-review', token);

  log('\n[4] Existing Stage 8 routes (regression)');
  await expectProtected(`${ADMIN}/ops/command-center`, 'GET /ops/command-center', token);
  await expectProtected(`${ADMIN}/admin-notifications`, 'GET /admin-notifications', token);
  await expectProtected(`${ADMIN}/support/tickets`, 'GET /support/tickets', token);
  await expectProtected(`${ADMIN}/operations/audit`, 'GET /operations/audit', token);
  await expectProtected(`${ADMIN}/system/overview`, 'GET /system/overview', token);

  log(`\nDone. ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

void main();
