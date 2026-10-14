# Hiring Signals — Privacy Policy

Effective: 14 October 2026

**Hiring Signals does not collect, store, sell or share any personal data.**

## What the extension does

When you click the toolbar icon, the extension:

1. Reads the address of the tab you are on and the links on that page, only at that moment and only in that tab (through Chrome's `activeTab` permission). It looks for links to public job boards (Greenhouse, Lever, Ashby, Workable, SmartRecruiters) and turns the site's domain into a company name guess (for example `stripe.com` → `stripe`).
2. Asks the public job-board APIs of those providers whether that company has open roles:
   - `boards-api.greenhouse.io`
   - `api.lever.co`
   - `api.ashbyhq.com`
   - `apply.workable.com`
   - `api.smartrecruiters.com`

   The only information in those requests is the company name (for example `stripe`). Your browsing history, the page's content, cookies and any identifiers are never sent.
3. Shows the results in the popup. If you click **CSV export**, the file is made inside your browser and saved to your computer. It is not uploaded anywhere.

## What it does not do

- No analytics, telemetry, tracking pixels or advertising.
- No accounts, sign-in or remote server operated by us.
- No storage of your browsing history, and no background activity. The extension runs only while its popup is open.
- No remote code. All code ships inside the extension package.

## Third parties

The job-board providers listed above receive standard web requests (your IP address and browser user agent, as with any website visit) when the popup looks up a company. Their own privacy policies govern those requests.

The footer link to the "startup hiring data" page is an ordinary web link. It opens only if you click it.

## Contact

Questions: open an issue at the project's support page listed on the Chrome Web Store, or email the developer address shown on the listing.
