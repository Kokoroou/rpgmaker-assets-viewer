# makerlens-feedback (Cloudflare Worker)

Receives the optional rating / idea / bug report that users send from MakerLens
(`js/feedback.js`). It is **not** part of the GitHub Pages site and is not published by
`deploy.yml`; deploy it separately with Wrangler.

It never receives game files. It stores only what the form sends, after validation:

| Column        | Example                  | Notes                                             |
|---------------|--------------------------|---------------------------------------------------|
| `created_day` | `2026-11-03`             | UTC day only, no time of day                      |
| `kind`        | `rating` / `idea` / `bug`| `rating` from the prompt, the others from About   |
| `rating`      | `4`                      | 1–5; optional for idea/bug                        |
| `comment`     | free text                | ≤ 1000 characters, optional for ratings           |
| `lang`        | `vi`                     | 2-letter browser language, to read the comment    |
| `opens`       | `3-5`                    | games opened so far (bucket)                      |
| `browser`     | `Chrome 131 · Windows`   | only when the user ticks the box (bug reports)    |

No IP, user agent, cookie or identifier is stored. The IP is only the in-memory key of
Cloudflare's rate limiter (5 requests/minute). Workers Logs are disabled.

## First deploy

```sh
cd feedback-worker
npx wrangler login
npx wrangler d1 create makerlens-feedback        # copy database_id into wrangler.toml
npx wrangler d1 execute makerlens-feedback --remote --file=schema.sql
npx wrangler secret put ADMIN_TOKEN              # long random string, e.g. `openssl rand -hex 32`
npx wrangler deploy
```

The site expects `https://makerlens-feedback.kokoroou.workers.dev/api/feedback`. If the
URL differs, change `ENDPOINT` in `js/feedback.js`, `connect-src` in `index.html` and
`ALLOWED_HOSTS` in `scripts/check-site.mjs`.

## Reading results

```sh
# JSON: count, average, star distribution, per kind, 50 latest comments
curl -H "Authorization: Bearer $ADMIN_TOKEN" https://makerlens-feedback.kokoroou.workers.dev/api/feedback/summary

# Everything as CSV (opens in Excel / Google Sheets)
curl -H "Authorization: Bearer $ADMIN_TOKEN" -o feedback.csv https://makerlens-feedback.kokoroou.workers.dev/api/feedback/export.csv

# Ad-hoc SQL — see queries.sql
npx wrangler d1 execute makerlens-feedback --remote --command "SELECT rating, COUNT(*) FROM feedback GROUP BY rating"
```

Response rate: the site also counts the anonymous GoatCounter events `feedback-shown`,
`feedback-skipped` and `feedback-sent` (no content, just the count), so
`sent / shown` in the GoatCounter dashboard is the share of asked users who answered.

## Testing locally

`node --test tests/feedback-worker.test.mjs` (from the repo root) runs the handler with a
fake D1. `npx wrangler dev` serves it on `http://localhost:8787`; add
`http://localhost:8000` (or wherever you serve the site) to `ALLOWED_ORIGINS` for that.
