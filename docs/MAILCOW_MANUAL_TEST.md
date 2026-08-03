# Manual Test — Mailcow Email Integration (Neokik SaaS)

Verifies that the client-facing email panel talks to the real Mailcow instance
and never falls back to simulated data. Run this after deploying with
`MIGRATION_DRY_RUN=false` and a real `MAILCOW_API_KEY` on the VPS.

## Prerequisites

- Backend deployed with `NODE_ENV=production`, `MIGRATION_DRY_RUN=false`,
  `MAILCOW_API_URL` and `MAILCOW_API_KEY` pointing to the real Mailcow instance.
- A client in Neokik whose `domain` is `tdd.cl`, and that domain already exists
  in Mailcow (confirm with `curl -H "X-API-Key: $KEY" https://mail.tdd.cl/api/v1/get/domain/all`).
- A valid Neokik admin JWT (`$TOKEN`) and the client's id (`$CLIENT_ID`).
- `$API` = base URL of the Neokik backend, e.g. `https://app.neokikdigital.com/api`.

Each step below has both a UI path (Clientes → seleccionar cliente → Casillas
de Correo) and an equivalent `curl` call so results can be cross-checked
directly against Mailcow.

## 1. List existing mailboxes for tdd.cl

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$API/infrastructure/clients/$CLIENT_ID/emails" | jq
```

**Expected:** the real mailboxes reported by Mailcow for `tdd.cl`
(`administracion@tdd.cl`, `felipevenegas@tdd.cl`, etc.), each with `used_mb` /
`quota_mb` derived from Mailcow's byte values — not `contacto@`/`info@` mocks.
Cross-check against:

```bash
curl -s -H "X-API-Key: $MAILCOW_KEY" https://mail.tdd.cl/api/v1/get/mailbox/all/tdd.cl | jq
```

The set of addresses must match exactly.

## 2. Create prueba@tdd.cl

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/infrastructure/clients/$CLIENT_ID/email" \
  -d '{"local_part":"prueba","domain":"tdd.cl","password":"PruebaSegura123!","quota":512}' | jq
```

**Expected:** HTTP 201, `email: "prueba@tdd.cl"`. Confirm it now appears in
step 1's listing and in Mailcow's own admin UI / `get/mailbox/all/tdd.cl`.

**Negative check (should fail, do not skip):** repeat the call with
`"domain":"otrodominio.cl"` (a domain that is not this client's) — must return
`403 El dominio no pertenece a este cliente`. Repeat with a domain that is
syntactically valid but not provisioned in Mailcow (e.g. `"domain":"noexiste.tdd.cl"`,
assuming that client's domain field is changed to match for the test, or use
a throwaway client whose domain isn't in Mailcow) — must return
`400 El dominio ... no está registrado en Mailcow`.

## 3. Change prueba@tdd.cl's password

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/infrastructure/clients/$CLIENT_ID/email/prueba%40tdd.cl" \
  -d '{"password":"NuevaClave456!"}' | jq
```

**Expected:** HTTP 200. Verify by logging into `prueba@tdd.cl`'s webmail
(SOGo/Roundcube on the Mailcow instance) with the new password — the old
password must no longer work.

## 4. Change prueba@tdd.cl's quota

```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "$API/infrastructure/clients/$CLIENT_ID/email/prueba%40tdd.cl" \
  -d '{"quota":1024}' | jq
```

**Expected:** HTTP 200. Re-run step 1's listing (or
`get/mailbox/prueba@tdd.cl` directly against Mailcow) and confirm
`quota_mb` is now `1024`, not the value set in step 2.

## 5. Delete prueba@tdd.cl

```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" \
  "$API/infrastructure/clients/$CLIENT_ID/email/prueba%40tdd.cl" | jq
```

**Expected:** HTTP 200. Confirm the mailbox is gone from both step 1's
listing and Mailcow's `get/mailbox/all/tdd.cl` response — and that logging
into `prueba@tdd.cl`'s webmail now fails.

## 6. Audit trail check

```sql
SELECT action, entity, metadata, status, created_at
FROM audit_logs
WHERE metadata->>'email' = 'prueba@tdd.cl'
ORDER BY created_at;
```

**Expected:** four rows — `email:create`, `email:update_password`,
`email:update_quota`, `email:delete` — all `status = 'SUCCESS'`, and the
`metadata` for the password-change row must **not** contain the plaintext
password (only `password_changed: true`).

## Pass criteria

All five operations must be reflected in Mailcow itself, confirmed via direct
`curl` calls to the Mailcow API (or its admin UI) independent of Neokik's own
database — Neokik holds no local copy of mailbox state, so if Mailcow doesn't
show the change, the feature is broken regardless of what the Neokik UI says.
