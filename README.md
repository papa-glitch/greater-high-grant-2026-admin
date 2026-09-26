# GREATER HIGH GRANT 2026 — Admin Version

Dynamic Node/Express version with a private admin dashboard and PostgreSQL-backed applications.

## Render
Create a **Web Service**, not a Static Site.
- Build Command: `npm install`
- Start Command: `npm start`
- Add environment variables: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL`
- The public site is `/` and the private dashboard is `/admin`.

## Important
The application form stores applicant name, email, phone, date of birth and state. Do not collect SSNs, bank passwords, card numbers or other unnecessary sensitive information.

Before accepting real applications, publish complete official rules, privacy terms, funding/organization information, and selection procedures. Render's free Postgres is intended for testing and expires after 30 days; use a paid database for ongoing production storage.
