# Host the portfolio with admin editing

Upload this entire folder to a hosting service that can run **Node.js 24 or newer** with a writable persistent disk. The application serves the portfolio itself. Set the application's startup command to `npm start` (or `node server.mjs`). The package has no npm dependencies.

Set these environment variables in the hosting control panel:

| Variable | Value |
| --- | --- |
| `ADMIN_PASSWORD` | Your private admin password. The username is `admin`. |
| `PUBLIC_ORIGIN` | The public HTTPS address, such as `https://portfolio.example.com`, with no subfolder. |
| `PORT` | The port assigned by your host. Defaults to 3000. |
| `HOST` | Defaults to `127.0.0.1` for a reverse proxy on the same machine. Set `0.0.0.0` when required by a managed platform that exposes the app through its HTTPS proxy. |
| `DATA_DIR` | Path to the host's persistent writable disk, if the application folder itself is ephemeral. Defaults to `data` alongside the application. |
| `TRUST_PROXY` | Optional. Set to `1` only when the Node port is reachable exclusively through a trusted proxy that appends the actual connecting IP as the final `X-Forwarded-For` value. |

Point your host's HTTPS reverse proxy at this Node application. Keep the backend port private. Use one app instance with a persistent local disk for SQLite. The app creates `portfolio.sqlite` on its first start using `schema.sql` and the exported public content in `seed.json`. Keep the data directory when deploying updates. Files in the database and other server files are outside the routes the site serves.

## Run on your Windows computer

Install Node.js 24 or newer, then run `powershell -ExecutionPolicy Bypass -File .\start.ps1` from this folder. Enter your password at the private prompt. Open http://127.0.0.1:3000 and use **Admin login** in the footer.

The `public` folder contains the HTML, CSS, and browser JavaScript. Start the server to preview this version. On hosting that only serves static files, use the separate view-only `publish` folder.