# Chrome Web Store listing — Hiring Signals

## Name (≤45 chars)
Hiring Signals — open roles for any company
(43 characters)

## Short description / summary (≤132 chars)
See any company's open roles from Greenhouse, Lever, Ashby, Workable & SmartRecruiters: counts by team, remote share, CSV export.
(129 characters; identical to the manifest `description`)

## Category
Primary: **Productivity** (alternative: "Tools", or "Workflow & Planning" in the newer category taxonomy)

## Language
English

## Detailed description

Is this company hiring, and for what? Hiring Signals answers that in one click.

Open the popup on any company's website and it finds the company's public job board on Greenhouse, Lever, Ashby, Workable or SmartRecruiters. You see:

• Total open roles
• Breakdown by function: Engineering, Data & AI, Security, Product, Design, Sales, Marketing, Customer Success, Finance & Legal, People & Recruiting, Operations
• Remote share
• How many roles were posted in the last 30 days, and the newest posting date
• The full list of roles with links to each apply page, filterable by function
• Free CSV export of the company's roles

WHO IT'S FOR
• Sales and BD reps: hiring is a buying signal. A company adding ten security engineers is about to spend on security tooling. Time your outreach.
• Job seekers: see every open role at a company in seconds, without digging for its careers page.
• Investors, recruiters and analysts: a quick read on where a company is growing.

HOW IT FINDS THE BOARD
1. It looks for job-board links on the page you're viewing (for example jobs.lever.co/<company>).
2. If there are none, it guesses from the domain (stripe.com → "stripe") and checks all five job-board providers.
3. You can also type any company name, "lever:palantir", or paste a job-board link.

PRIVATE BY DESIGN
• No account, no tracking, no analytics.
• Runs only when you click it, and only on the current tab.
• The only data requests go to the job-board providers' official public APIs, and they contain just the company name.

Want hiring data across many companies? The footer links to a free dataset of 390 startups' hiring signals.

Not affiliated with Greenhouse, Lever, Ashby, Workable or SmartRecruiters. Data comes from each company's public job board and is only as current as that board.

## Single purpose (dashboard field)
Shows the open job postings of the company whose website you are viewing (or that you type in), using that company's public job board on Greenhouse, Lever, Ashby, Workable or SmartRecruiters, summarised by function, remote share and recency.

## Permission justifications (dashboard fields)

**activeTab**
Used only when the user clicks the toolbar icon, to read the current tab's URL. This gives the company domain (e.g. stripe.com → "stripe") that the extension looks up on public job boards. No access to any tab unless the user invokes the extension.

**scripting**
Used with activeTab, only after the user clicks the icon, to run one small function in the current tab. It collects link URLs that point to job-board hosts (greenhouse.io, lever.co, ashbyhq.com, workable.com, smartrecruiters.com) so the extension can find the company's exact job board. Nothing on the page is changed, and no other page content is read or sent anywhere.

**Host permissions**
None requested. The job-board APIs used (boards-api.greenhouse.io, api.lever.co, api.ashbyhq.com, apply.workable.com, api.smartrecruiters.com) send `Access-Control-Allow-Origin: *`, so ordinary fetch() from the popup works without host permissions. The extension's CSP `connect-src` is restricted to exactly those five hosts.

**Remote code**
No. All JavaScript is bundled in the package. No eval, no remotely hosted scripts, no `new Function`.

## Data usage disclosures (dashboard checkboxes)
- Personally identifiable information: **not collected**
- Health, financial, authentication, personal communications, location: **not collected**
- Web history: **not collected**. The current tab's URL is read locally when the user clicks the icon. Only the derived company name is sent, to the job-board APIs, to fulfil the single purpose. It is never stored or sent to the developer.
- User activity, website content: **not collected**. Job-board link URLs are read locally from the active tab and are not transmitted.
- Certify: not sold to third parties; not used for unrelated purposes; not used for creditworthiness or lending.

## Privacy policy URL
Host `privacy.md` publicly (for example on the GitHub Pages site) and paste that URL. The dashboard requires a URL, not a file.

## Assets
- Icon 128×128: `icons/icon128.png` (96px artwork + 16px transparent padding)
- Screenshot 1280×800: `store-assets/screenshot-1280x800.png` (real popup code, live Stripe data, rendered with headless Chrome)
- Small promo tile 440×280: not made yet (optional)
