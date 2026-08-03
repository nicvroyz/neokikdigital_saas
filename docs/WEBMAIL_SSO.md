# Webmail SSO — "Abrir Webmail" without re-entering credentials

Lets a Neokik admin open a client's mailbox in SOGo directly from
`ClientDetailPage.jsx` → Correos, with no password prompt, without Neokik ever
storing or seeing a mailbox password, and without exposing any Mailcow
credential to the browser.

## Why this needed a custom bridge

Mailcow's own "admin login to SOGo" feature (`ALLOW_ADMIN_EMAIL_LOGIN`) only
works when the browser already has a live **Mailcow admin UI** session — it
checks a PHP `$_SESSION`, not anything reachable from Neokik's own auth. There
is no Mailcow API endpoint that mints a magic login link, and Mailcow's App
Passwords authenticate IMAP/SMTP/DAV/EAS but not the SOGo web GUI itself (both
confirmed against upstream mailcow source/issues before building this).

## How it works

```
Neokik admin (logged into Neokik)
        |
        | clicks "Webmail" next to a mailbox
        v
POST /api/clients/:id/emails/:address/webmail-token   (Neokik backend)
        | validates client + mailbox ownership, confirms the mailbox
        | exists in Mailcow, signs a 60s single-use HMAC token
        v
Browser is redirected to:
https://mail.<domain>/sogo-auth.php?neokik_token=<token>
        | (infra/mailcow/sogo-auth.php — one added branch)
        | verifies HMAC signature + expiry + not-already-used,
        | confirms the mailbox exists, then does exactly what
        | Mailcow's own native admin-login path already does:
        | registers the email in the PHP session and redirects to /SOGo/so/
        v
SOGo (unmodified) — nginx's existing auth_request -> sogo-auth.php flow
picks up the session and logs the browser in, same mechanism mailcow's
native feature already relies on.
```

The signing secret (`WEBMAIL_SSO_SECRET` in Neokik / `NEOKIK_WEBMAIL_SSO_SECRET`
in mailcow.conf) is a **new shared secret between two servers**, never a
mailbox password and never sent to the frontend. The token itself is opaque,
expires in 60 seconds, and can only be redeemed once (tracked via a marker
file in `/tmp/neokik-sso-used/` inside the php-fpm-mailcow container).

## What's in this repo vs. what you deploy separately

| Piece | Where | Status |
|---|---|---|
| `POST /api/clients/:id/emails/:address/webmail-token` | `backend/src/controllers/clientResourcesController.ts` | Implemented |
| Token signing | `backend/src/services/webmailSsoService.ts` | Implemented |
| "Webmail" button | `frontend/src/pages/ClientDetailPage.jsx` | Implemented |
| Audit logging (`email:webmail_access`) | `audit_logs` table, same pattern as other mailbox actions | Implemented |
| The actual bridge file | `infra/mailcow/sogo-auth.php` | **You must deploy this to the Mailcow host** |
| Volume mount | `infra/mailcow/docker-compose.override.yml.example` | **You must apply this on the Mailcow host** |

Neokik's own code fails closed if this isn't deployed: with `WEBMAIL_SSO_SECRET`
unset, the button returns `503` rather than silently doing something insecure.

## Deployment steps (on the Mailcow VPS/host)

1. Generate a secret: `openssl rand -hex 32`.
2. Set it in **both** places:
   - Neokik's `backend/.env`: `WEBMAIL_SSO_SECRET=<value>`
   - Mailcow's `mailcow.conf`: `NEOKIK_WEBMAIL_SSO_SECRET=<same value>`
3. Copy `infra/mailcow/sogo-auth.php` onto the Mailcow host (e.g. keep this repo
   checked out there, or copy just this file) and merge
   `infra/mailcow/docker-compose.override.yml.example` into your mailcow-dockerized
   `docker-compose.override.yml` (adjust the host path to wherever you placed the file).
4. From the mailcow-dockerized directory: `docker compose up -d php-fpm-mailcow`.
5. Restart Neokik's backend so it picks up `WEBMAIL_SSO_SECRET`.
6. **Re-apply step 3's mount after every `mailcow update`** if the update process
   ever recreates `docker-compose.override.yml` handling — verify it survives,
   since this is not an officially supported mailcow customization point (it's
   a bind-mount over one upstream file).

## Manual test

1. In Neokik: Clientes → Administrar → Correos → click **Webmail** next to an
   active mailbox. A new tab should open straight into that mailbox's inbox —
   no login form.
2. Try clicking the same button's resulting URL a second time (reuse the token
   from network tab, or just note the token is single-use) — must fail (falls
   through to the site root, not the inbox).
3. Wait >60 seconds after generating a token, then try using it — must fail
   (expired).
4. Suspend the mailbox in Neokik (Correos → Suspender) and confirm the
   "Webmail" button becomes disabled.
5. Check `audit_logs` for an `email:webmail_access` row with `status = SUCCESS`
   after step 1.
6. Check Mailcow's own SASL log (Mailcow UI → a mailbox's login history, or the
   `sasl_log` table) — the SSO login should show up tagged `NEOKIK-SSO`,
   distinguishable from mailcow's own native `SSO` admin-login tag.

## Known limitations

- Relies on bind-mounting a modified copy of an upstream mailcow file — must be
  re-diffed against upstream after `mailcow update` (comment at the top of the
  file marks exactly what was added).
- The single-use marker files in `/tmp/neokik-sso-used/` are cleaned up by
  container restarts and short TTL, but nothing prunes them proactively between
  restarts on a long-lived container. Harmless (tiny empty files, one per
  redeemed token) but you may add `find /tmp/neokik-sso-used -mmin +5 -delete`
  to an existing cron on the mailcow host if you want it tidier.
- Once a SOGo session is established this way, ending it works the same as any
  other SOGo session (logout button inside SOGo, or the browser tab losing its
  cookie) — Neokik does not currently offer a "kill this webmail session"
  control from its own UI.
