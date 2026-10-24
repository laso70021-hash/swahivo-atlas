# Swahivo local development

Swahivo runs at **http://127.0.0.1:5173/** against the existing hosted **Carenta** Supabase project, `ilzsgzzfujjjlexhiigy`.

## Start and configuration

The Vite development server is running as a hidden background Node process. To start it again after restarting Windows, run:

```powershell
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

The ignored `.env.local` contains only the actual project URL and public publishable key. Privileged credentials are never used in browser code. All 58 migrations are applied through the Supabase CLI; the original 54 versions are preserved. No database reset or seed was used.

## Implemented

- Supplied Swahivo identity and showroom imagery, responsive homepage, `/cars` and `/rentals`, vehicle details, provider profiles and pricing.
- Real Auth customer/business registration. Business applicants request dealership, rental, or both; a trusted platform administrator approves services. Additional services attach to the same existing organization.
- The existing Zanzibar Car Hub owner is the first platform administrator, as requested. Existing organization settings and records are preserved.
- Dealership listing editor, private photo uploads, moderation, free listing quota and separate service entitlements. Rental listings explicitly link to real existing fleet vehicles.
- Customer saved vehicles, enquiries and reservation requests. Provider enquiries create real CRM leads; staff assignment, notes, follow-up dates, tasks and CSV export persist in Supabase.
- Server-calculated daily rental quotes, deposits, actual rental-contract creation on provider confirmation, overlap prevention and reservation lifecycle synchronization. Original fleet, calendar, rental contracts, customers, expenses, financing, reports and team modules remain available.
- Capability-controlled test-drive and financing enquiries, support tickets and admin replies, promotion requests, admin record management, service controls and audit records.
- Customer review submission for completed transactions and approved reviews on provider profiles. Reviews require actual completed transactions and administrator moderation.
- Six specified dealership packages. Separate Stripe Checkout and signed webhook functions grant entitlements only from server-verified payment events. Missing credentials return an explicit setup error.

## Verification on 24 October 2026

- Production build and TypeScript check passed. Both new billing Edge Functions also passed Deno type checking.
- Full ESLint run passed with zero errors and 15 warnings (primarily existing React development-refresh warnings).
- 40 targeted unit/route tests passed.
- 29 integration checks passed against the real Carenta project: signup token confirmation/password login, role escalation prevention, business approval, fleet and listing writes, listing quota/moderation, private/public media access, CRM updates/activities/tasks, tenant isolation, availability, strict booking acceptance, server pricing, conversion to an original rental contract, overlap and sale conflicts, unpaid order completion prevention, test drives/finance requests, support replies, review eligibility enforcement and administrative access control.
- All temporary verification accounts, organizations and uploaded photos were removed. Confirmed zero remaining temporary accounts and businesses.
- Every public table has RLS enabled. Production browser bundles were scanned: zero privileged credentials found.
- Browser checks covered homepage, admin business entitlements, original rental dashboard, rental search controls and mobile layout. No horizontal overflow at the checked desktop/mobile sizes.
- The complete legacy Atlas test suite has not been certified for the new approval workflow. Its old signup fixtures expect immediate agency creation, which this implementation intentionally replaces with business approval.

## Remaining setup and unfinished scope

- **Payments:** Carenta does not have `BILLING_STRIPE_SECRET_KEY`, `SWAHIVO_STRIPE_WEBHOOK_SECRET` or actual Stripe price IDs configured. Paid checkout and payment settlement have not been exercised with Stripe. No live payments were made. The administrator-only offline receipt RPC exists, but an admin receipt-entry interface is not yet built.
- **Email:** signup token confirmation and password login were tested directly; delivery of signup/reset/invitation emails through a real mailbox has not been verified. Custom SMTP and the invitation sender need actual provider configuration.
- **Reviews:** rejection before transaction completion was tested; successful customer submission after a fully completed real transaction and publication have not yet been tested end to end.
- **Extended pricing:** marketplace quotes currently cover the daily rate and deposit. Optional extras, tax and fee configuration still need implementation and verification.
- **Sale customer association:** manually created sales orders do not yet attach to an authenticated customer account. Customer purchase history/review eligibility therefore needs a verified buyer-association workflow.
- **Content:** admin brands/categories/content/marketing records persist, but published content is not yet wired into every public section. Rental plan prices remain unpublished because none were supplied.
- **Inventory/contact details:** there are no published marketplace listings. Add real fleet/sale listings and complete provider contact details before publication; there is no demonstration inventory or invented contact destination.
- Existing database security advisories include mutable search paths and leaked-password protection configuration. New privileged functions explicitly check permissions and set a fixed search path; the server-only billing-event/admin tables intentionally deny browser access.

Local diagnostic logs, integration reports and screenshots are under the ignored `.atlas-setup.local` directory. The server stays running while this Codex task ends.
