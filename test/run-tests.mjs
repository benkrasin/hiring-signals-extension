// Node 18+ test: unit checks for detection/CSV + live calls to the real public ATS APIs.
// Usage: node test/run-tests.mjs   (exit code 1 on any failure)
import assert from 'node:assert/strict';
import {
  detectFromLinks, slugCandidatesFromHost, parseManualInput, resolveBoard,
  summarize, categorize, toCsv, fetchers,
} from '../ats.js';

let failed = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`ok   ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}: ${e.message}`); }
};

// ---- offline unit checks ----
await check('slugCandidatesFromHost', () => {
  assert.deepEqual(slugCandidatesFromHost('https://stripe.com/jobs'), ['stripe']);
  assert.deepEqual(slugCandidatesFromHost('https://www.ramp.com/'), ['ramp']);
  assert.deepEqual(slugCandidatesFromHost('https://careers.airbnb.com/positions'), ['airbnb']);
  assert.deepEqual(slugCandidatesFromHost('https://www.monzo.co.uk'), ['monzo']);
  assert.deepEqual(slugCandidatesFromHost('https://my-co.io'), ['my-co', 'myco']);
  assert.deepEqual(slugCandidatesFromHost('chrome://newtab'), []);
  assert.deepEqual(slugCandidatesFromHost('https://www.google.com/search?q=x'), []);
});
await check('detectFromLinks', () => {
  const hits = detectFromLinks([
    'https://boards.greenhouse.io/airbnb/jobs/123',
    'https://job-boards.greenhouse.io/airbnb',
    'https://boards.greenhouse.io/embed/job_board/js?for=databricks',
    'https://jobs.lever.co/palantir/abc-123',
    'https://jobs.ashbyhq.com/ramp/xyz',
    'https://apply.workable.com/huggingface/',
    'https://jobs.smartrecruiters.com/Visa/7438',
    'https://example.com/careers',
  ]);
  assert.deepEqual(hits, [
    { ats: 'greenhouse', slug: 'airbnb' },
    { ats: 'greenhouse', slug: 'databricks' },
    { ats: 'lever', slug: 'palantir' },
    { ats: 'ashby', slug: 'ramp' },
    { ats: 'workable', slug: 'huggingface' },
    { ats: 'smartrecruiters', slug: 'Visa' },
  ]);
});
await check('parseManualInput', () => {
  assert.deepEqual(parseManualInput('lever:palantir'), [{ ats: 'lever', slug: 'palantir' }]);
  assert.deepEqual(parseManualInput('Ramp'), [{ ats: null, slug: 'ramp' }]);
  assert.deepEqual(parseManualInput('https://jobs.ashbyhq.com/ramp'), [{ ats: 'ashby', slug: 'ramp' }]);
  assert.deepEqual(parseManualInput('stripe.com'), [{ ats: null, slug: 'stripe' }]);
  assert.deepEqual(parseManualInput('<script>'), []);
});
await check('categorize', () => {
  assert.equal(categorize({ department: 'Engineering', title: 'x' }), 'Engineering');
  assert.equal(categorize({ department: null, title: 'Senior Account Executive' }), 'Sales');
  assert.equal(categorize({ department: null, title: 'Staff Machine Learning Engineer' }), 'Data & AI');
  assert.equal(categorize({ department: 'Security', title: 'Engineer' }), 'Security');
  assert.equal(categorize({ department: null, title: 'Product Marketing Manager' }), 'Marketing');
});
await check('toCsv escaping + formula neutralisation', () => {
  const csv = toCsv([{ company: 'A, Inc', ats: 'lever', title: '=HYPERLINK("x")', department: null, location: 'NYC', remote: true, postedAt: null, url: 'https://x' }]);
  const line = csv.split('\r\n')[1];
  assert.ok(line.startsWith('"A, Inc",lever,"\'=HYPERLINK(""x"")"'), line);
});

// ---- live API checks (network) ----
const live = [
  // [label, candidates, expected ats]
  ['greenhouse airbnb (explicit)', [{ ats: 'greenhouse', slug: 'airbnb' }], 'greenhouse'],
  ['greenhouse databricks (explicit)', [{ ats: 'greenhouse', slug: 'databricks' }], 'greenhouse'],
  ['lever palantir (explicit)', [{ ats: 'lever', slug: 'palantir' }], 'lever'],
  ['ashby ramp (explicit)', [{ ats: 'ashby', slug: 'ramp' }], 'ashby'],
  ['hostname stripe.com (auto-detect all ATSs)', slugCandidatesFromHost('https://stripe.com').map((slug) => ({ ats: null, slug })), null],
  ['hostname ramp.com (auto-detect all ATSs)', slugCandidatesFromHost('https://ramp.com').map((slug) => ({ ats: null, slug })), 'ashby'],
  ['hostname palantir.com (auto-detect all ATSs)', slugCandidatesFromHost('https://www.palantir.com').map((slug) => ({ ats: null, slug })), 'lever'],
  ['smartrecruiters Ubisoft2 (explicit)', [{ ats: 'smartrecruiters', slug: 'Ubisoft2' }], 'smartrecruiters'],
  ['smartrecruiters BoschGroup (capped at 1000)', [{ ats: 'smartrecruiters', slug: 'BoschGroup' }], 'smartrecruiters'],
  ['workable huggingface (explicit)', [{ ats: 'workable', slug: 'huggingface' }], 'workable'],
  ['nonexistent slug returns null', [{ ats: null, slug: 'zz-no-such-company-hs-test-9137' }], 'none'],
];

for (const [label, cands, expectAts] of live) {
  await check(`live: ${label}`, async () => {
    const t0 = Date.now();
    const board = await resolveBoard(cands);
    const ms = Date.now() - t0;
    if (expectAts === 'none') { assert.equal(board, null); console.log(`       -> null (${ms} ms)`); return; }
    assert.ok(board, 'no board found');
    if (expectAts) assert.equal(board.ats, expectAts);
    const s = summarize(board.jobs);
    const top = s.categories.slice(0, 5).map(([k, v]) => `${k} ${v}`).join(', ');
    console.log(`       -> ${board.ats}:${board.slug} total=${s.total} remote=${s.remote} (${Math.round(s.remoteShare * 100)}%) last30d=${s.postedLast30Days} newest=${s.newestPostedAt?.slice(0, 10)} withDept=${board.jobs.filter((j) => j.department).length} reportedTotal=${board.reportedTotal} (${ms} ms)`);
    assert.ok(s.total > 0, 'expected open roles');
    console.log(`          top functions: ${top}`);
    for (const j of board.jobs.slice(0, 200)) {
      assert.ok(j.title, 'job missing title');
      assert.ok(/^https?:\/\//.test(j.url || ''), `bad url ${j.url}`);
    }
  });
}

// Per-ATS raw counts for stripe to show which ATS it uses.
await check('live: stripe per-ATS raw', async () => {
  const parts = [];
  for (const ats of Object.keys(fetchers)) {
    try { const j = await fetchers[ats]('stripe'); parts.push(`${ats}=${j ? j.length : 'none'}`); }
    catch (e) { parts.push(`${ats}=err(${e.message})`); }
  }
  console.log(`       -> ${parts.join(' ')}`);
});

console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
