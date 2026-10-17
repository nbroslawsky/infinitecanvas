# Infinite canvas

A private canvas for arranging images, labels, and frames. Each person has their own boards. Pan, zoom, snap, and rotation come from the MIT [Daybrush](https://github.com/daybrush) libraries.

Copy `.env.example` to `.env`. Never commit `.env`. It holds Google credentials, the auth secret, and (in production) the database and file-storage tokens.

## Run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app expects that address because `BETTER_AUTH_URL` is `http://localhost:3000`. A server started on another port will show **Sign in with Google** and then do nothing useful, because Google is registered against port 3000.

Restart `npm run dev` after you change `.env`. The dev server only reads that file when it starts.

### Environment variables for local use

| Name | Local value |
|---|---|
| `BETTER_AUTH_SECRET` | Any long random string. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` | From the Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | From the same client |
| `ADMIN_EMAILS` | The Gmail address you will sign in with. Comma-separate more than one. |
| `DATABASE_URL` | Leave empty. Boards are stored in `.data/pglite`. |
| `BLOB_READ_WRITE_TOKEN` | Leave empty. Images are stored in `.data/blobs`. |

The Google credential must be a **Web application**. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), on that client, add:

- Authorized JavaScript origin: `http://localhost:3000`
- Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`

If the OAuth consent screen is in **Testing**, add that same Gmail address as a test user. Otherwise Google refuses the sign-in even though this app would allow it.

Without `GOOGLE_CLIENT_ID`, the sign-in page shows **Continue** instead of Google. That button exists only for local development.

`ADMIN_EMAILS` is the allowlist seed. Those addresses can sign in and can add other people on the People page. Adding someone does not send email. Tell them to open the site and sign in with the address you entered.

## Production on Vercel

The GitHub repo is `nbroslawsky/infinitecanvas`.

1. Import the repo at [vercel.com/new](https://vercel.com/new).
2. In the Vercel project, open **Storage** and create a **Neon** database. Connect it to this project. Vercel sets `DATABASE_URL`.
3. In **Storage**, create a **public** Blob store and connect it. Vercel sets `BLOB_READ_WRITE_TOKEN`.
4. In **Settings → Environment Variables**, add these for Production:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `BETTER_AUTH_SECRET` (a new random string, not the Google secret)
   - `ADMIN_EMAILS`
5. Deploy once. The site URL looks like `https://your-project.vercel.app`.
6. In the Google OAuth client, add that origin and this redirect URI: `https://your-project.vercel.app/api/auth/callback/google`
7. Set `BETTER_AUTH_URL` to `https://your-project.vercel.app` with no trailing slash.
8. Redeploy.

Leave `BETTER_AUTH_URL` empty on the first deploy only, because you do not know the Vercel hostname yet. After step 7 it must be set.

## What a new session needs to know

- Boards are private. Every query is scoped to the signed-in user. Admins cannot open someone else's boards.
- Removing an email on the People page blocks their next request. Their boards stay in the database.
- Canvas gestures come from `react-infinite-viewer`, `react-moveable`, and `react-selecto`. Frame parenting, align, distribute, and export scale live in `src/lib/layout.ts`.
- PNG export uses `modern-screenshot`. PDF export uses `pdf-lib` and `public/fonts/Inter-Regular.ttf`. Several boards export as one PDF or a zip of PNGs.
- Inter is under the SIL Open Font License. See `public/fonts/LICENSE.txt`.
