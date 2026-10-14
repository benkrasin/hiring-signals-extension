// Hiring Signals — ATS detection, fetching and summarising.
// Uses only the official, public, unauthenticated job-board APIs of each ATS.
// Every endpoint below answers with `Access-Control-Allow-Origin: *`, so plain
// fetch() works from the extension popup without any host permissions.
// This module has no chrome.* dependency so it can be tested with Node 18+.

export const ATS_LIST = ['greenhouse', 'lever', 'ashby', 'workable', 'smartrecruiters'];

export const ATS_LABEL = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  ashby: 'Ashby',
  workable: 'Workable',
  smartrecruiters: 'SmartRecruiters',
};

const SLUG_RE = /^[A-Za-z0-9][\w.-]{0,99}$/;
export const isValidSlug = (s) => typeof s === 'string' && SLUG_RE.test(s);

const getJson = async (url, signal, attempt = 0) => {
  let r;
  try {
    r = await fetch(url, { signal, headers: { accept: 'application/json' } });
  } catch (e) {
    if (e.name === 'AbortError' || attempt >= 1) throw e;
    return getJson(url, signal, attempt + 1); // one retry on transient network failure
  }
  if (r.status === 404 || r.status === 400) return null;
  if (r.status >= 500 && attempt < 1) return getJson(url, signal, attempt + 1);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const isRemote = (...s) => s.some((x) => /\bremote\b|anywhere|distributed/i.test(x || ''));
const iso = (v) => {
  if (v == null || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const enc = encodeURIComponent;
// Some boards prefix departments with cost-center codes ("7312 CorpTech"); drop them for display.
const cleanDept = (d) => (d ? String(d).replace(/^\d{2,}\s*[-–:]?\s+/, '').trim() || null : null);

export const fetchers = {
  async greenhouse(slug, signal) {
    // content=false omits departments; fetch them in parallel (optional, failures ignored).
    const [d, dd] = await Promise.all([
      getJson(`https://boards-api.greenhouse.io/v1/boards/${enc(slug)}/jobs?content=false`, signal),
      getJson(`https://boards-api.greenhouse.io/v1/boards/${enc(slug)}/departments`, signal).catch((e) => {
        if (e.name === 'AbortError') throw e;
        return null;
      }),
    ]);
    if (!d || !Array.isArray(d.jobs)) return null;
    const deptById = new Map();
    for (const dep of dd?.departments || []) for (const j of dep.jobs || []) deptById.set(j.id, dep.name);
    return d.jobs.map((j) => ({
      ats: 'greenhouse', company: j.company_name || slug, id: String(j.id), title: j.title || '',
      department: cleanDept(deptById.get(j.id)), location: j.location?.name || null,
      remote: isRemote(j.location?.name), postedAt: iso(j.first_published || j.updated_at),
      url: j.absolute_url || `https://job-boards.greenhouse.io/${slug}/jobs/${j.id}`,
    }));
  },
  async lever(slug, signal) {
    // Lever has no field selection and is slow on big boards, so page in parallel
    // (100 per page, 4 pages at a time) until a short page comes back.
    const PAGE = 100, PARALLEL = 4, MAX_PAGES = 20;
    const page = (i) => getJson(`https://api.lever.co/v0/postings/${enc(slug)}?mode=json&limit=${PAGE}&skip=${i * PAGE}`, signal);
    const raw = [];
    let exists = false;
    for (let next = 0, done = false; !done && next < MAX_PAGES; next += PARALLEL) {
      const batch = await Promise.all(Array.from({ length: Math.min(PARALLEL, MAX_PAGES - next) }, (_, k) => page(next + k)));
      for (const b of batch) {
        if (!Array.isArray(b)) { done = true; break; }
        exists = true;
        raw.push(...b);
        if (b.length < PAGE) { done = true; break; }
      }
    }
    if (!exists) return null;
    const seen = new Set();
    return raw.filter((j) => !seen.has(j.id) && seen.add(j.id)).map((j) => ({
      ats: 'lever', company: slug, id: j.id, title: j.text || '',
      department: cleanDept(j.categories?.department || j.categories?.team),
      location: j.categories?.location || null,
      remote: j.workplaceType === 'remote' || isRemote(j.categories?.location),
      postedAt: iso(j.createdAt), url: j.hostedUrl || j.applyUrl,
    }));
  },
  async ashby(slug, signal) {
    const d = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${enc(slug)}`, signal);
    if (!d || !Array.isArray(d.jobs)) return null;
    return d.jobs.filter((j) => j.isListed !== false).map((j) => ({
      ats: 'ashby', company: slug, id: j.id, title: j.title || '',
      department: cleanDept(j.department || j.team), location: j.location || null,
      remote: !!j.isRemote || j.workplaceType === 'Remote' || isRemote(j.location),
      postedAt: iso(j.publishedAt), url: j.jobUrl || j.applyUrl,
    }));
  },
  async workable(slug, signal) {
    const d = await getJson(`https://apply.workable.com/api/v1/widget/accounts/${enc(slug)}`, signal);
    if (!d || !Array.isArray(d.jobs)) return null;
    return d.jobs.map((j) => {
      const loc = [j.city, j.state, j.country].filter(Boolean).join(', ') || null;
      return {
        ats: 'workable', company: d.name || slug, id: j.shortcode, title: j.title || '',
        department: cleanDept(j.department || j.function), location: loc,
        remote: !!j.telecommuting || isRemote(loc),
        postedAt: iso(j.published_on || j.created_at), url: j.url || j.shortlink,
      };
    });
  },
  async smartrecruiters(slug, signal, { maxPages = 10 } = {}) {
    const out = [];
    for (let page = 0; page < maxPages; page++) {
      const d = await getJson(`https://api.smartrecruiters.com/v1/companies/${enc(slug)}/postings?limit=100&offset=${page * 100}`, signal);
      if (!d || !Array.isArray(d.content)) return out.length ? out : null;
      for (const j of d.content) {
        out.push({
          ats: 'smartrecruiters', company: j.company?.name || slug, id: String(j.id), title: j.name || '',
          department: cleanDept(j.department?.label || j.function?.label),
          location: j.location?.fullLocation || [j.location?.city, j.location?.country].filter(Boolean).join(', ') || null,
          remote: !!j.location?.remote || isRemote(j.location?.fullLocation),
          postedAt: iso(j.releasedDate), url: `https://jobs.smartrecruiters.com/${enc(slug)}/${enc(j.id)}`,
        });
      }
      out.reportedTotal = d.totalFound || out.length;
      if ((page + 1) * 100 >= (d.totalFound || 0)) break;
    }
    return out;
  },
};

// ---------- Detection ----------

const LINK_PATTERNS = [
  ['greenhouse', /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board(?:\/js)?\?for=)?([A-Za-z0-9_-]+)/i],
  ['greenhouse', /greenhouse\.io\/embed\/job_board(?:\/js)?\?(?:[^"'\s]*&)?for=([A-Za-z0-9_-]+)/i],
  ['lever', /jobs(?:\.eu)?\.lever\.co\/([A-Za-z0-9_.-]+)/i],
  ['ashby', /jobs\.ashbyhq\.com\/([A-Za-z0-9_.%-]+)/i],
  ['workable', /apply\.workable\.com\/([A-Za-z0-9_-]+)/i],
  ['smartrecruiters', /(?:jobs|careers)\.smartrecruiters\.com\/([A-Za-z0-9_-]+)/i],
];
const RESERVED = new Set(['embed', 'api', 'v1', 'jobs', 'job', 'j', 'oneclick-ui', 'static', 'assets', 'search', 'login']);

/** Find explicit {ats, slug} references in a list of URLs/strings (deduped, ordered by frequency). */
export function detectFromLinks(urls) {
  const counts = new Map();
  for (const raw of urls || []) {
    if (typeof raw !== 'string') continue;
    for (const [ats, re] of LINK_PATTERNS) {
      const m = raw.match(re);
      if (!m) continue;
      let slug;
      try { slug = decodeURIComponent(m[1]); } catch { slug = m[1]; }
      slug = slug.replace(/\.$/, '');
      if (!isValidSlug(slug) || RESERVED.has(slug.toLowerCase())) continue;
      const key = `${ats}:${slug}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      break;
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => {
    const i = k.indexOf(':');
    return { ats: k.slice(0, i), slug: k.slice(i + 1) };
  });
}

const TWO_PART_TLDS = /\.(co|com|org|net|ac|gov|edu)\.[a-z]{2}$/i;
const GENERIC_HOSTS = /^(google|bing|duckduckgo|linkedin|github|twitter|x|facebook|youtube|wikipedia|reddit|localhost|newtab)$/i;

/** Derive slug candidates from a page URL/hostname: stripe.com -> ["stripe"]; my-co.io -> ["my-co","myco"]. */
export function slugCandidatesFromHost(urlOrHost) {
  let host = String(urlOrHost || '').trim();
  try { if (/^[a-z][\w+.-]*:\/\//i.test(host)) host = new URL(host).hostname; } catch { return []; }
  host = host.toLowerCase().replace(/\.$/, '');
  if (!host || /^\d+\.\d+\.\d+\.\d+$/.test(host) || !host.includes('.')) return [];
  // If the user is already on an ATS board, the link detector handles it.
  const parts = host.split('.');
  const label = TWO_PART_TLDS.test(host) ? parts[parts.length - 3] : parts[parts.length - 2];
  if (!label || GENERIC_HOSTS.test(label)) return [];
  const out = [label];
  if (label.includes('-')) out.push(label.replace(/-/g, ''));
  return [...new Set(out)].filter(isValidSlug);
}

/**
 * Parse whatever the user typed: "stripe", "lever:palantir", or a full board URL.
 * Returns a list of {ats, slug} to try (ats may be null meaning "try all").
 */
export function parseManualInput(input) {
  const s = String(input || '').trim();
  if (!s) return [];
  const m = s.match(/^(greenhouse|lever|ashby|workable|smartrecruiters)\s*[:/]\s*(.+)$/i);
  if (m && isValidSlug(m[2].trim())) return [{ ats: m[1].toLowerCase(), slug: m[2].trim() }];
  const fromLink = detectFromLinks([s]);
  if (fromLink.length) return fromLink;
  if (/[./]/.test(s)) return slugCandidatesFromHost(s.includes('://') ? s : `https://${s}`).map((slug) => ({ ats: null, slug }));
  const slug = s.toLowerCase().replace(/\s+/g, '');
  return isValidSlug(slug) ? [{ ats: null, slug }] : [];
}

/**
 * Try candidates in order. A candidate with a fixed ATS is tried alone; one with ats=null
 * is tried against all five ATSs in parallel and the board with the most roles wins.
 * Returns { ats, slug, jobs } or null.
 */
export async function resolveBoard(candidates, { signal, onTry } = {}) {
  const errors = [];
  for (const c of candidates) {
    const targets = c.ats ? [c.ats] : ATS_LIST;
    onTry?.(c);
    const results = await Promise.all(targets.map(async (ats) => {
      try { return { ats, slug: c.slug, jobs: await fetchers[ats](c.slug, signal) }; }
      catch (e) { if (e.name === 'AbortError') throw e; errors.push(`${ats}:${c.slug} ${e.message}`); return null; }
    }));
    const hits = results.filter((r) => r && Array.isArray(r.jobs) && r.jobs.length);
    if (hits.length) {
      const best = hits.sort((a, b) => b.jobs.length - a.jobs.length)[0];
      best.reportedTotal = Math.max(best.jobs.reportedTotal || 0, best.jobs.length);
      return best;
    }
    // Explicit link to a board with zero openings is still a definitive answer.
    if (c.ats && results[0] && Array.isArray(results[0].jobs)) return results[0];
  }
  if (errors.length && errors.length >= candidates.length) {
    const err = new Error(`Network errors: ${errors.slice(0, 3).join('; ')}`);
    err.partial = errors;
    throw err;
  }
  return null;
}

// ---------- Summary ----------

// Order matters: first match wins. Tested against department name first, then job title.
export const CATEGORIES = [
  ['Security', /secur|infosec|appsec|\bsoc\b|threat|vulnerab|identity & access|\biam\b|trust & safety|privacy eng/i],
  ['Data & AI', /\bdata\b|machine learning|\bml\b|\bai\b|artificial intel|analytics|analyst|scientist|research scien|\bllm|deep learning|\bnlp\b|computer vision/i],
  ['Engineering', /engineer|developer|software|devops|\bsre\b|infrastructure|platform|backend|front.?end|full.?stack|mobile|\bios\b|android|firmware|hardware|technical|architect|\bqa\b|quality assurance|information tech|helpdesk|systems admin|r&d|tech lead/i],
  ['Product', /\bproduct\b(?! market)|program manag|project manag|\btpm\b/i],
  ['Design', /design|\bux\b|\bui\b|user research|creative|brand design/i],
  ['Sales', /sales|account exec|\bae\b|\bsdr\b|\bbdr\b|business develop|account manag|partnership|solutions? (engineer|consult|architect)|pre.?sales|revenue|go.?to.?market|\bgtm\b|channel/i],
  ['Marketing', /marketing|growth|content|communications|\bpr\b|public relations|social media|\bseo\b|demand gen|brand|events|community|product market/i],
  ['Customer Success', /customer|support|success|onboarding|implementation|professional services|client|experience/i],
  ['Finance & Legal', /financ|accounting|accountant|tax|treasury|\bfp&a\b|controller|payroll|audit|legal|counsel|compliance|attorney|paralegal|risk|procurement/i],
  ['People & Recruiting', /people|talent|recruit|\bhr\b|human resources|workplace|learning & dev/i],
  ['Operations', /operation|\bops\b|logistics|supply chain|facilities|strategy|business analyst|administrat|assistant|executive|office|manufactur|warehouse|field/i],
];

export function categorize(job) {
  for (const src of [job.department, job.title]) {
    if (!src) continue;
    for (const [name, re] of CATEGORIES) if (re.test(src)) return name;
  }
  return 'Other';
}

export function summarize(jobs, now = Date.now()) {
  const byCategory = new Map();
  const byDepartment = new Map();
  let remote = 0, newest = null, last30 = 0;
  for (const j of jobs) {
    const cat = categorize(j);
    byCategory.set(cat, (byCategory.get(cat) || 0) + 1);
    const dep = j.department || 'Unspecified';
    byDepartment.set(dep, (byDepartment.get(dep) || 0) + 1);
    if (j.remote) remote++;
    if (j.postedAt) {
      if (!newest || j.postedAt > newest) newest = j.postedAt;
      if (now - Date.parse(j.postedAt) <= 30 * 864e5) last30++;
    }
  }
  const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    total: jobs.length,
    remote,
    remoteShare: jobs.length ? remote / jobs.length : 0,
    newestPostedAt: newest,
    postedLast30Days: last30,
    categories: sortDesc(byCategory),
    departments: sortDesc(byDepartment),
  };
}

// ---------- CSV ----------

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // neutralise spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(jobs) {
  const cols = ['company', 'ats', 'title', 'category', 'department', 'location', 'remote', 'postedAt', 'url'];
  const rows = jobs.map((j) => [j.company, j.ats, j.title, categorize(j), j.department, j.location, j.remote ? 'yes' : 'no', j.postedAt, j.url]);
  return [cols, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
