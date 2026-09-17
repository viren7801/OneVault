# Private Pocket

A private cross-device personal workspace for:

- Pocket — expenses, budgets and accounts
- Reminders — tasks and notifications
- Passwords — encrypted personal vault
- Notes — quick notes and lists

## Run

```bash
npm install
npm run dev
```

## Next build step

Connect Supabase Auth + Row Level Security so only the owner's account can read/write app data. The password module must use client-side encryption so plaintext credentials are never stored in the database.

The current UI is a foundation/prototype; do not store real passwords in it yet.
