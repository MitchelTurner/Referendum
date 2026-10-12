# Referendum

Public meetings, on the record, for the City of Ketchikan, the Ketchikan Gateway Borough, and the City of Saxman.

```bash
pnpm install
pnpm db:migrate
pnpm seed
pnpm seed:demo
pnpm dev
```

`pnpm dev` starts the API (port 3000), the worker (port 3002), and the web app (port 5173). Health checks are `GET /health` on the API and the worker.

Demo staff login after `pnpm seed:demo`: `clerk.borough@demo.referendum.local` / `Demo-password-1`. The authenticator secret seeded for that account is `JBSWY3DPEHPK3PXP`.

Jurisdiction-specific notice periods, code citations, and retention schedules are configuration. Seeded values that are not yet confirmed from code say `TBD` and the product shows “rule not configured”.

## Restore drill

1. Restore the latest encrypted Postgres backup into a new database.
2. Point `DATABASE_URL` at it and run `pnpm db:migrate`.
3. `GET /health` must report `db: true`, and `GET /public/calendar` must return the restored meetings.
4. Keep 30 days of backups. Run this drill when the backup job changes.

AI text shown to the public is labeled automated until a staff user accepts it. Light theme only.