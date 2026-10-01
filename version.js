// Emits PUBLIC_APP_VERSION for the Vercel build (see the "vercel-build"
// npm script: `node version.js > .env.production.local`).
//
// The value is the RELEASED app version + code — single source of truth is
// version.json at the repo root, maintained by scripts/app-release.mjs
// (`npm run build:app`). So the deployed web app displays e.g.
// "2.95 (295)" everywhere PUBLIC_APP_VERSION is read, matching the native
// app's Settings → App Information.
import { readFileSync } from "fs";

let version = "unknown";

try {
  const info = JSON.parse(
    readFileSync(new URL("./version.json", import.meta.url), "utf8"),
  );
  if (info.versionName && info.versionCode) {
    version = `${info.versionName} (${info.versionCode})`;
  }
} catch (error) {
  console.error(`version.js: could not read version.json: ${error.message}`);
}

console.log(`PUBLIC_APP_VERSION=${version}`);



