# Infinite canvas

A private canvas for arranging images, labels, and frames. Each person has their own boards. Pan, zoom, snap, and rotation come from the MIT [Daybrush](https://github.com/daybrush) libraries.

## Local

```bash
npm install
npm run dev
```

Without `DATABASE_URL`, boards are stored in `.data/pglite`. Without `BLOB_READ_WRITE_TOKEN`, images are stored in `.data/blobs`. Without Google credentials, the sign-in page has a Continue button for local use.

## Production on Vercel

1. Create a Google OAuth client. Callback URL: `https://<your-domain>/api/auth/callback/google`
2. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `ADMIN_EMAILS`.
3. `vercel integration add neon` so `DATABASE_URL` is set.
4. Create a Blob store so `BLOB_READ_WRITE_TOKEN` is set.
5. `vercel deploy`

`ADMIN_EMAILS` is who can sign in on day one and who can add other emails on the People page. Adding someone does not send email.

Inter is used for labels, under the SIL Open Font License. See `public/fonts/LICENSE.txt`.
