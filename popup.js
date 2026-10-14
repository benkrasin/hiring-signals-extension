import {
  ATS_LABEL, detectFromLinks, slugCandidatesFromHost, parseManualInput,
  resolveBoard, summarize, categorize, toCsv,
} from './ats.js';

const $ = (id) => document.getElementById(id);
const MAX_LIST = 150;

const BOARD_URL = {
  greenhouse: (s) => `https://job-boards.greenhouse.io/${encodeURIComponent(s)}`,
  lever: (s) => `https://jobs.lever.co/${encodeURIComponent(s)}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${encodeURIComponent(s)}`,
  workable: (s) => `https://apply.workable.com/${encodeURIComponent(s)}/`,
  smartrecruiters: (s) => `https://jobs.smartrecruiters.com/${encodeURIComponent(s)}`,
};

let current = null; // { ats, slug, jobs, summary }
let controller = null;

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
}

function safeHref(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch { return null; }
}

function fmtDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else n[k] = v;
  }
  for (const c of children) if (c != null) n.append(c);
  return n;
}

// Runs inside the page (via chrome.scripting, only after the user clicks the icon).
// Returns candidate job-board URLs referenced by the page. Self-contained by design.
function collectBoardLinks() {
  const re = /greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com/i;
  const out = new Set();
  const add = (v) => { if (v && re.test(v) && out.size < 200) out.add(String(v).slice(0, 500)); };
  add(location.href);
  document.querySelectorAll('a[href]').forEach((a) => add(a.href));
  document.querySelectorAll('iframe[src], script[src]').forEach((n) => add(n.src));
  document.querySelectorAll('[data-url],[data-href]').forEach((n) => { add(n.dataset.url); add(n.dataset.href); });
  return [...out];
}

async function getActiveTab() {
  if (!globalThis.chrome?.tabs?.query) return null;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function scanTab(tab) {
  if (!tab?.id || !/^https?:/i.test(tab.url || '')) return [];
  try {
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectBoardLinks });
    return Array.isArray(res?.result) ? res.result : [];
  } catch {
    return []; // e.g. Chrome Web Store pages or other restricted URLs
  }
}

async function lookup(candidates, label) {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;
  $('result').hidden = true;
  $('lookup').querySelector('button').disabled = true;
  setStatus(`Looking up ${label}…`);
  const slowTimer = setTimeout(() => {
    if (!signal.aborted) setStatus('Large job board — still loading (some APIs return full job descriptions; this can take ~15s)…');
  }, 4000);
  try {
    const board = await resolveBoard(candidates, {
      signal,
      onTry: (c) => setStatus(`Checking ${c.ats ? ATS_LABEL[c.ats] : 'Greenhouse, Lever, Ashby, Workable, SmartRecruiters'} for “${c.slug}”…`),
    });
    if (signal.aborted) return;
    if (!board) {
      setStatus(`No public job board found for ${label}. Try the exact board name (e.g. “lever:palantir”) or paste the careers-page link.`, true);
      return;
    }
    render(board);
  } catch (e) {
    if (e.name === 'AbortError') return;
    setStatus(`Couldn't reach the job-board APIs (${e.message}). Check your connection and try again.`, true);
  } finally {
    clearTimeout(slowTimer);
    if (!signal.aborted) $('lookup').querySelector('button').disabled = false;
  }
}

function render(board) {
  const jobs = [...board.jobs].sort((a, b) => (b.postedAt || '').localeCompare(a.postedAt || ''));
  const summary = summarize(jobs);
  current = { ...board, jobs, summary };
  setStatus(board.reportedTotal > jobs.length
    ? `Showing the newest ${jobs.length.toLocaleString()} of ${board.reportedTotal.toLocaleString()} roles (SmartRecruiters page limit).` : '');
  $('slug').value = `${board.ats}:${board.slug}`;

  const src = $('source');
  src.textContent = ATS_LABEL[board.ats];
  src.hidden = false;

  const companyName = jobs.find((j) => j.company && j.company !== board.slug)?.company || board.slug;
  $('company').textContent = companyName;
  $('company').title = `${ATS_LABEL[board.ats]} board: ${board.slug}`;
  $('boardLink').href = BOARD_URL[board.ats](board.slug);

  $('statTotal').textContent = summary.total.toLocaleString();
  $('statRemote').textContent = summary.total ? `${Math.round(summary.remoteShare * 100)}%` : '—';
  $('stat30').textContent = summary.newestPostedAt ? summary.postedLast30Days.toLocaleString() : '—';
  $('statNewest').textContent = fmtDate(summary.newestPostedAt);

  const max = summary.categories[0]?.[1] || 1;
  const filter = $('filter');
  filter.replaceChildren(el('option', { value: '' }, 'All functions'));
  $('categories').replaceChildren(...summary.categories.map(([name, n]) => {
    filter.append(el('option', { value: name }, `${name} (${n})`));
    const li = el('li', { title: `Show ${name} roles` },
      el('span', { class: 'name' }, name),
      el('span', { class: 'track' }, el('span', { class: 'fill', style: `width:${Math.max(3, (n / max) * 100)}%` })),
      el('span', { class: 'count' }, String(n)));
    li.addEventListener('click', () => { filter.value = name; renderJobs(); });
    return li;
  }));
  if (!summary.total) $('categories').replaceChildren(el('li', {}, el('span', { class: 'name' }, 'No open roles right now')));

  filter.value = '';
  renderJobs();
  $('csv').disabled = !summary.total;
  $('result').hidden = false;
}

function renderJobs() {
  if (!current) return;
  const f = $('filter').value;
  const list = f ? current.jobs.filter((j) => categorize(j) === f) : current.jobs;
  const items = list.slice(0, MAX_LIST).map((j) => {
    const href = safeHref(j.url);
    const title = href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, j.title || 'Untitled role')
      : el('span', {}, j.title || 'Untitled role');
    const meta = [j.department, j.location, j.remote ? 'Remote' : null, j.postedAt ? fmtDate(j.postedAt) : null]
      .filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
    return el('li', {}, title, el('div', { class: 'meta' }, meta));
  });
  if (list.length > MAX_LIST) items.push(el('li', { class: 'more' }, `+ ${list.length - MAX_LIST} more — use CSV export or the board link for the full list`));
  $('jobs').replaceChildren(...items);
}

function exportCsv() {
  if (!current) return;
  const blob = new Blob([toCsv(current.jobs)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = el('a', { href: url, download: `${current.slug}-${current.ats}-open-roles-${date}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function init() {
  $('lookup').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('slug').value;
    const cands = parseManualInput(input);
    if (!cands.length) { setStatus('Enter a company name, “ats:slug”, or a job-board URL.', true); return; }
    lookup(cands, `“${input.trim()}”`);
  });
  $('filter').addEventListener('change', renderJobs);
  $('csv').addEventListener('click', exportCsv);

  const tab = await getActiveTab();
  const links = await scanTab(tab);
  const fromLinks = detectFromLinks(links);
  const fromHost = slugCandidatesFromHost(tab?.url || '').map((slug) => ({ ats: null, slug }));
  const seen = new Set();
  const candidates = [...fromLinks, ...fromHost].filter((c) => {
    const k = `${c.ats}:${c.slug.toLowerCase()}`;
    return seen.has(k) ? false : (seen.add(k), true);
  }).slice(0, 4);

  if (!candidates.length) {
    setStatus('Open a company website, or type a company name above.');
    $('slug').focus();
    return;
  }
  $('slug').value = candidates[0].ats ? `${candidates[0].ats}:${candidates[0].slug}` : candidates[0].slug;
  let host = '';
  try { host = new URL(tab.url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
  lookup(candidates, host || `“${candidates[0].slug}”`);
}

init();
