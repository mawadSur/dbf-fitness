import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';

const PORT = 8231;
const BASE_URL = `http://localhost:${PORT}`;
const READY_TIMEOUT_MS = 180_000;
const READY_POLL_INTERVAL_MS = 1_000;
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCREENSHOT_DIR = path.join(PROJECT_ROOT, 'docs', 'screenshots');
const EXPO_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'expo');

// Fixed IDs from supabase/seed.sql (local dev only).
const DEMO_EMAIL = 'member@dbf.demo';
const DEMO_COACH_EMAIL = 'coach@dbf.demo';
const DEMO_PASSWORD = 'password123';
const DAY_1_ID = '44444444-4444-4444-4444-444444444401';
const DAY_1_FIRST_EXERCISE_LABEL = 'High Knees';
// Jordan Lee (DEMO_EMAIL) and Sam Rivera share group 77777777-…, so each one's
// roster card is `person-<the other's id>`.
const MEMBER_ID = '22222222-2222-2222-2222-222222222222';
const SAM_EMAIL = 'sam@dbf.demo';
const SAM_ID = '66666666-6666-6666-6666-666666666666';
const SAM_NAME = 'Sam Rivera';
const LIVE_CLASS_ID = '88888888-8888-8888-8888-888888888888';
const LIVE_CLASS_TITLE = 'Saturday Conditioning';
const VIEWPORT = { width: 1280, height: 900 };
// Presence and realtime joins are network round trips through local Supabase
// Realtime; generous, but bounded, so a real failure is reported instead of hanging.
const PRESENCE_TIMEOUT_MS = 20_000;

let expoProcess: ChildProcess | null = null;
let cleanedUp = false;

// Browser console errors and uncaught page errors are attributed to the next
// screenshot taken from the same page (i.e. the screen being prepared).
type PageWatch = { who: string; pending: string[] };
type ErrorRecord = { file: string; who: string; messages: string[] };

const IGNORED_ERROR_PATTERNS: { label: string; pattern: RegExp }[] = [
  {
    label: 'nativewind "Cannot manually set color scheme" (dev-only web warning)',
    pattern: /Cannot manually set color scheme/,
  },
];

const pageWatches = new WeakMap<Page, PageWatch>();
const errorRecords: ErrorRecord[] = [];
const ignoredCounts = new Map<string, number>();
// Defects that must be called out in the run summary (e.g. presence not working).
const findings: string[] = [];
// Every console message seen, by type — proves the listeners were live when
// the error list comes back empty.
const consoleTotals = new Map<string, number>();

function watchPage(page: Page, who: string): void {
  const watch: PageWatch = { who, pending: [] };
  pageWatches.set(page, watch);

  const record = (text: string): void => {
    const ignored = IGNORED_ERROR_PATTERNS.find(({ pattern }) => pattern.test(text));
    if (ignored) {
      ignoredCounts.set(ignored.label, (ignoredCounts.get(ignored.label) ?? 0) + 1);
      return;
    }
    watch.pending.push(text);
  };

  page.on('console', (msg) => {
    consoleTotals.set(msg.type(), (consoleTotals.get(msg.type()) ?? 0) + 1);
    if (msg.type() === 'error') record(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => record(`pageerror: ${err.message}`));
}

function flushPageErrors(page: Page, file: string): void {
  const watch = pageWatches.get(page);
  if (!watch || watch.pending.length === 0) return;
  errorRecords.push({ file, who: watch.who, messages: watch.pending.splice(0) });
}

function reportConsoleSummary(): void {
  console.log('\n=== Console / page error summary ===');
  if (errorRecords.length === 0) {
    console.log('No console errors or page errors (after ignore list).');
  }
  for (const { file, who, messages } of errorRecords) {
    console.log(`${file} [${who}]: ${messages.length} error(s)`);
    for (const message of new Set(messages)) {
      console.log(`    ${message.replace(/\s+/g, ' ').slice(0, 240)}`);
    }
  }
  for (const [label, count] of ignoredCounts) {
    console.log(`Ignored ${count}x: ${label}`);
  }
  const totals = [...consoleTotals].map(([type, count]) => `${type}=${count}`).join(' ');
  console.log(`Console messages observed across all pages: ${totals || 'none'}`);

  console.log('\n=== Findings ===');
  if (findings.length === 0) console.log('None.');
  for (const finding of findings) console.log(`FINDING: ${finding}`);
}

function killExpoProcess(): void {
  if (cleanedUp) return;
  cleanedUp = true;

  const proc = expoProcess;
  if (!proc || proc.killed || proc.pid == null) return;

  try {
    // Negative pid targets the whole detached process group, so Metro's
    // child processes die with it instead of leaking as orphans.
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    // Process group may already be gone.
  }
}

function startExpoWeb(): ChildProcess {
  const child = spawn(EXPO_BIN, ['start', '--web', '--port', String(PORT)], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, CI: '1' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(`[expo] ${chunk}`));
  child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(`[expo] ${chunk}`));

  return child;
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (expoProcess?.exitCode != null) {
      throw new Error(`Expo dev server exited early with code ${expoProcess.exitCode}`);
    }
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) return;
    } catch {
      // Server not accepting connections yet.
    }
    await new Promise((resolve) => setTimeout(resolve, READY_POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for Expo web server at ${BASE_URL}`);
}

// Expo web's dev-mode LogBox renders a full-screen error overlay as sibling
// DOM nodes to #root instead of replacing it, so a caught/logged error (e.g.
// the known nativewind "Cannot manually set color scheme" warning on web)
// covers the real screen without actually preventing it from rendering.
// Strip those dev-only overlay nodes so the screenshot shows the app itself.
async function removeDevOverlays(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of Array.from(document.body.children)) {
      if (el.id !== 'root' && el.tagName !== 'SCRIPT' && el.tagName !== 'NOSCRIPT') {
        el.remove();
      }
    }
  });
}

async function snap(page: Page, file: string): Promise<void> {
  await page.waitForTimeout(500);
  await removeDevOverlays(page);
  flushPageErrors(page, file);

  const dest = path.join(SCREENSHOT_DIR, file);
  await page.screenshot({ path: dest, fullPage: true });
  console.log(`Saved ${dest}`);
}

async function gotoAndSnap(page: Page, urlPath: string, file: string): Promise<void> {
  const url = `${BASE_URL}${urlPath}`;
  console.log(`Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await snap(page, file);
}

// Auth-gated routes ((tabs)/* and /calendar) redirect to /sign-in until a
// session exists (see app/_layout.tsx's useSessionRedirect), so every
// authenticated screenshot must happen after this sign-in flow.
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle', timeout: 60_000 });
  // Driven by testID (react-native-web emits it as data-testid), not by
  // placeholder or visible text: the redesigned `AuthField` has a visible label
  // and NO placeholder, and the header renders the same words as the button.
  await page.getByTestId('sign-in-email').fill(email);
  await page.getByTestId('sign-in-password').fill(DEMO_PASSWORD);
  await page.getByTestId('sign-in-submit').click();
  await page.waitForURL(`${BASE_URL}/`, { timeout: 30_000 });
  await page.waitForLoadState('networkidle');
}

// Signs the current session out by clearing the web localStorage session
// token directly (see src/services/supabase/client.ts — on web, Supabase
// persists the session in window.localStorage), rather than driving a
// sign-out UI control that may not exist on every screen.
async function signOut(page: Page): Promise<void> {
  await page.evaluate(() => window.localStorage.clear());
  await page.goto(`${BASE_URL}/sign-in`, { waitUntil: 'networkidle', timeout: 60_000 });
}

// The roster fetch and presence subscription resolve after network idle, so
// wait for the given person's row (its accessible name starts with their name).
async function openCommunity(page: Page, memberId: string): Promise<void> {
  await page.goto(`${BASE_URL}/community`, { waitUntil: 'networkidle', timeout: 60_000 });
  await personCard(page, memberId).waitFor({ timeout: 30_000 });
}

// The redesigned roster row (src/components/community/PersonRow.tsx) is a Card
// with testID `person-<memberId>`, not a pressable that opens a hidden menu —
// Report/Block are always visible inside it, and presence is a dot plus the
// word rendered by PresenceLabel (testID presence-online/presence-offline).
function personCard(page: Page, memberId: string): Locator {
  return page.getByTestId(`person-${memberId}`);
}

function personPresence(page: Page, memberId: string, presence: 'online' | 'offline'): Locator {
  return personCard(page, memberId).getByTestId(`presence-${presence}`);
}

async function openLiveClass(page: Page, urlPath: string, title: string): Promise<void> {
  await page.goto(`${BASE_URL}${urlPath}`, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.getByText(title, { exact: true }).waitFor({ timeout: 30_000 });
}

// Waits for a UI condition that depends on Realtime. Failure is recorded as a
// finding (and the caller still captures the broken state) rather than thrown,
// so one presence problem does not cost every later screenshot.
async function waitOrFind(locator: Locator, failure: string): Promise<boolean> {
  try {
    await locator.first().waitFor({ timeout: PRESENCE_TIMEOUT_MS });
    return true;
  } catch {
    findings.push(`${failure} (not seen within ${PRESENCE_TIMEOUT_MS} ms)`);
    return false;
  }
}

async function joinLiveClass(page: Page): Promise<void> {
  await joinClassButton(page).click();
  await page.getByText('Camera preview (mock)').first().waitFor({ timeout: 30_000 });
}

// src/components/live/ClassJoinPanel.tsx labels the action "Join class" (its
// accessible name is the same string), so the old exact "Join" never matches.
function joinClassButton(page: Page): Locator {
  return page.getByRole('button', { name: 'Join class', exact: true });
}

// The inner ScrollView is what scrolls (fullPage cannot see into it), and the
// single mock video tile fills a desktop-width viewport, so the participant
// list and Leave button start below the fold. Scroll the nearest scrollable
// ancestor of Leave to its end (rather than just revealing the button) so the
// content's bottom padding shows instead of the button touching the tab bar.
async function scrollClassRoomIntoView(page: Page): Promise<void> {
  await page.getByTestId('call-controls-leave').evaluate((leave) => {
    for (let node = leave.parentElement; node; node = node.parentElement) {
      const scrollable =
        node.scrollHeight > node.clientHeight && getComputedStyle(node).overflowY !== 'visible';
      if (scrollable) {
        node.scrollTop = node.scrollHeight;
        return;
      }
    }
  });
}

// Waits until the "In this class (n)" list shows n names, or the list reports
// itself unavailable (private live-channel authorization failing).
async function waitForClassCount(page: Page, count: number, who: string): Promise<void> {
  const ready = page.getByText(`In this class (${count})`, { exact: true });
  const unavailable = page.getByText('Participant list unavailable', { exact: false });
  const seen = await waitOrFind(
    ready.or(unavailable),
    `Live class presence: ${who} never saw "In this class (${count})"`
  );
  if (seen && (await unavailable.count()) > 0) {
    findings.push(
      `Live class presence: ${who} shows "Participant list unavailable" — private live channel authorization failed in the browser`
    );
  }
}

async function newSignedInPage(
  browser: Browser,
  contexts: BrowserContext[],
  email: string,
  who: string
): Promise<Page> {
  const context = await browser.newContext({ viewport: VIEWPORT });
  contexts.push(context);
  const page = await context.newPage();
  watchPage(page, who);
  await signIn(page, email);
  return page;
}

// Phase 4 (community + live classes) needs several simultaneous signed-in
// users, so each gets its own browser context (separate localStorage session).
// Blocking Sam mutates what everyone sees, so it must stay the last step.
async function capturePhase4(browser: Browser): Promise<void> {
  const contexts: BrowserContext[] = [];
  const pages: Page[] = [];
  try {
    const jordan = await newSignedInPage(browser, contexts, DEMO_EMAIL, 'jordan');
    pages.push(jordan);

    // Roster with Sam offline (Sam has no open session yet).
    await openCommunity(jordan, SAM_ID);
    await personPresence(jordan, SAM_ID, 'offline').waitFor({ timeout: 30_000 });
    await snap(jordan, 'community-roster.png');

    // Sam sits on the Community tab, tracking presence on group:<id>.
    const sam = await newSignedInPage(browser, contexts, SAM_EMAIL, 'sam');
    pages.push(sam);
    await openCommunity(sam, MEMBER_ID);
    await waitOrFind(
      personPresence(jordan, SAM_ID, 'online'),
      'Group presence: Jordan never saw Sam Online while Sam sat on the Community tab — private-channel presence is failing in a real browser'
    );
    await snap(jordan, 'community-roster-online.png');

    // Report flow (writes moderation_reports; reset at the end of the run).
    // Report/Block are always-visible buttons on the card now, and their
    // accessible names carry the person's name so two rosters never collide.
    await jordan.getByRole('button', { name: `Report ${SAM_NAME}`, exact: true }).click();
    await jordan.getByText(`Why are you reporting ${SAM_NAME}?`).waitFor({ timeout: 30_000 });
    await snap(jordan, 'community-report.png');
    await jordan.getByTestId('report-reason-Harassment').click();
    await jordan.getByRole('button', { name: 'Send report', exact: true }).click();
    await jordan.getByTestId('report-sent').waitFor({ timeout: 30_000 });
    await snap(jordan, 'community-report-sent.png');

    // Live schedule and class lobby.
    await openLiveClass(jordan, '/community/live', LIVE_CLASS_TITLE);
    await snap(jordan, 'live-schedule.png');

    const classPath = `/community/live/${LIVE_CLASS_ID}`;
    await openLiveClass(jordan, classPath, LIVE_CLASS_TITLE);
    await joinClassButton(jordan).waitFor({ timeout: 30_000 });
    await snap(jordan, 'live-class-lobby.png');

    // Joined alone: presence must list Jordan.
    await joinLiveClass(jordan);
    await waitForClassCount(jordan, 1, 'Jordan');
    await scrollClassRoomIntoView(jordan);
    await snap(jordan, 'live-class-joined.png');

    // Sam and the coach join too; Jordan's list should grow to three names.
    await openLiveClass(sam, classPath, LIVE_CLASS_TITLE);
    await joinLiveClass(sam);
    await waitForClassCount(jordan, 2, 'Jordan');

    const coach = await newSignedInPage(browser, contexts, DEMO_COACH_EMAIL, 'coach');
    pages.push(coach);
    await openLiveClass(coach, '/community/live', LIVE_CLASS_TITLE);
    await snap(coach, 'live-schedule-coach.png');
    await openLiveClass(coach, classPath, LIVE_CLASS_TITLE);
    await joinLiveClass(coach);
    await waitForClassCount(jordan, 3, 'Jordan');
    await scrollClassRoomIntoView(jordan);
    await snap(jordan, 'live-class-joined-multi.png');

    // Last DB-mutating step: Jordan blocks Sam, so the roster empties out.
    await openCommunity(jordan, SAM_ID);
    await jordan.getByRole('button', { name: `Block ${SAM_NAME}`, exact: true }).click();
    // The inline confirm replaces the Report/Block row with "Yes, block".
    await jordan.getByRole('button', { name: `Yes, block ${SAM_NAME}`, exact: true }).click();
    await jordan.getByText('No one else here yet', { exact: true }).waitFor({ timeout: 30_000 });
    await snap(jordan, 'community-blocked-empty.png');
  } finally {
    for (const page of pages) flushPageErrors(page, '(after last screenshot)');
    await Promise.all(contexts.map((context) => context.close()));
  }
}

async function captureScreenshots(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    watchPage(page, 'main');

    await gotoAndSnap(page, '/sign-in', 'auth-sign-in.png');
    await gotoAndSnap(page, '/sign-up', 'auth-sign-up.png');

    await signIn(page, DEMO_EMAIL);
    await snap(page, 'tab-home.png');

    await gotoAndSnap(page, '/workout', 'tab-workout.png');

    await gotoAndSnap(page, `/workout/${DAY_1_ID}`, 'workout-day-detail.png');

    await page.getByText(DAY_1_FIRST_EXERCISE_LABEL, { exact: true }).click();
    await page.waitForURL((url) => url.pathname.includes('/workout/exercise/'), {
      timeout: 30_000,
    });
    await snap(page, 'workout-exercise-detail.png');

    // The redesign replaced the "‹ Back" text button with ScreenHeader's
    // icon-only back control (testID screen-header-back). Expo Router keeps the
    // day screen mounted underneath on web, so two back buttons are in the DOM
    // — scope to this screen's ScreenShell (testID "exercise") or Playwright's
    // strict mode rejects the click.
    await page.getByTestId('exercise').getByTestId('screen-header-back').click();
    await page.waitForURL((url) => url.pathname === `/workout/${DAY_1_ID}`, { timeout: 30_000 });
    await page.waitForLoadState('networkidle');

    const checkboxes = page.getByRole('checkbox');
    const checkboxCount = await checkboxes.count();
    for (let i = 0; i < checkboxCount; i += 1) {
      await checkboxes.nth(i).click();
    }

    // Button label is now "Finish workout" (lower-case w) — use its testID.
    await page.getByTestId('finish-workout').click();
    await page.getByText('Workout complete', { exact: false }).waitFor({ timeout: 30_000 });
    // Give the milestone-toast mount/animation time to settle before capture.
    await page.waitForTimeout(1_000);
    await snap(page, 'workout-finished.png');

    await gotoAndSnap(page, '/food', 'tab-food.png');
    await openCommunity(page, SAM_ID);
    await snap(page, 'tab-community.png');
    await gotoAndSnap(page, '/profile', 'tab-profile.png');
    await gotoAndSnap(page, '/calendar', 'calendar.png');

    // Effort screen as the signed-in member: RLS scopes member_workout_stats
    // to the member's own row only, so this renders the solo "Your Effort"
    // card rather than a multi-row leaderboard (see effort.tsx).
    await gotoAndSnap(page, '/effort', 'effort-member-view.png');

    await signOut(page);
    await signIn(page, DEMO_COACH_EMAIL);

    // As the coach, effort.tsx sees the full coached roster via RLS and
    // renders a real ranked leaderboard; effort-review.tsx's coach-only gate
    // also opens, exposing the RPE-scoring UI.
    await gotoAndSnap(page, '/effort', 'effort-leaderboard.png');
    await gotoAndSnap(page, '/effort-review', 'effort-review.png');

    await capturePhase4(browser);
  } finally {
    await browser.close();
  }
}

// The Finish Workout flow above writes real rows (workout_completions,
// exercise_completions, milestones) into the local Supabase Postgres
// instance. Reset so this script stays idempotent and later phases start
// from the same clean seed state.
function resetDatabase(): void {
  console.log('Resetting local Supabase database to clean seed state...');
  try {
    execFileSync('supabase', ['db', 'reset'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
  } catch (err) {
    console.error('supabase db reset failed — clean up local DB state manually.', err);
  }
}

async function main(): Promise<void> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });

  expoProcess = startExpoWeb();

  await waitForServer();
  console.log(`Expo web server ready at ${BASE_URL}`);

  try {
    await captureScreenshots();
  } finally {
    reportConsoleSummary();
    // Phase 4 flows write blocks/reports/participants even when a later step
    // fails, so always restore the clean seed state.
    resetDatabase();
  }
}

process.on('SIGINT', () => {
  killExpoProcess();
  process.exit(1);
});
process.on('SIGTERM', () => {
  killExpoProcess();
  process.exit(1);
});

main()
  .then(() => {
    console.log('Screenshot run complete.');
  })
  .catch((err) => {
    console.error('Screenshot run failed:', err);
    process.exitCode = 1;
  })
  .finally(() => {
    killExpoProcess();
  });
