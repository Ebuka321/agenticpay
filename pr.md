## Summary

This PR delivers frontend work for **issuer multisig detection** (partial signing awareness), **theme persistence** hardening, and an **employer dashboard** shell aligned with the Stellar Design System. It also fixes **Prettier** formatting on touched files so `npx prettier . --check` passes in CI (as in `.github/workflows/build.yml`).

**Closes:** #389, #392, #26 (or link your fork’s issue numbers as appropriate)

---

## What changed

### Issue #389 — On-chain multisig support (issuers)

- **`getHorizonUrlForNetwork()`** — Chooses testnet vs public Horizon when `PUBLIC_STELLAR_HORIZON_URL` is unset, matching the connected wallet network.
- **`detectMultisig(accountId, { horizonUrl? })`** — Optional Horizon override for issuer checks.
- **`useConfiguredIssuerMultisig`** — Fetches multisig metadata for all configured issuers in `SUPPORTED_ASSETS`.
- **`IssuerMultisigBanner`** — SDS `Alert` on payroll, bulk upload, and cross-asset payment flows when issuers require multiple signatures.
- **`appendPartialSigningHint` / `useWalletSigning`** — Common auth failures (`tx_bad_auth`, `op_bad_auth`, etc.) surface multisig / XDR follow-up guidance in notifications and local error state.

### Issue #392 — Dark mode persistence

- Theme remains under **`localStorage` key `payd-theme`**.
- **Validates** stored values (`light` | `dark` only).
- Applies theme in **`useLayoutEffect`** to reduce flash; **`storage`** listener keeps tabs in sync.

### Issue #26 — Employer dashboard layout

- **`EmployerLayout`** — Responsive sidebar (drawer on small viewports), top bar with **`VITE_ORG_DISPLAY_NAME`** (fallback “Organization”), native **XLM balance** via Horizon, Connect / theme / language; SDS **Button**, **Heading**, **Text**; nav icons via **lucide-react** (consistent with `AppNav`).
- **Routes under `/employer`** — Payroll, employees, reports, cross-asset, transactions, revenue split, analytics, bulk upload, settings; index redirects to payroll.
- **`AppNav`** — Link to **`/employer`**.
- **`/admin`** — Route wired to **`AdminPanel`** (nav already pointed here).

### Docs & config

- **README** — Short notes on `/employer`, `payd-theme`, issuer multisig.
- **`.env.example`** — Optional `VITE_ORG_DISPLAY_NAME`.

### Tests

- `ThemeProvider.test.tsx`, `EmployerLayout.test.tsx`, `multisigHorizon.test.ts`, `signingErrors.test.ts`.

### CI hygiene

- Ran the workflow’s frontend steps locally: `npm ci --legacy-peer-deps`, `npm run lint`, `npx prettier . --check`, `npm run build`, `npm test`. **Prettier** required a `--write` pass on five files; all steps now succeed.

---

## How to verify

1. From `frontend/`:  
   `npm ci --legacy-peer-deps && npm run lint && npx prettier . --check && npm run build && npm test`
2. Open **`/employer`** — sidebar, org title, balance (with wallet connected).
3. Toggle theme, refresh — preference should persist; open a second tab and toggle — tabs should stay aligned.
4. On payroll / bulk upload / cross-asset pages — if configured issuers are multisig on the active network, the warning banner appears.

---

## Checklist

- [x] Lint passes
- [x] Prettier check passes
- [x] Production build passes
- [x] Vitest passes
