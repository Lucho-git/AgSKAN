# Android release → Google Play (one command)

`npm run app:publish` bumps the version, builds the web app, produces a signed
App Bundle and uploads it to the Play Console **production** track. The web
deploy stays as it is (Vercel builds on every push), so the website and the app
always report the same version — both read `version.json`.

```
npm run app:publish                 # patch bump (2.96 → 2.97) + full production rollout
npm run app:publish:minor           # same as patch (names are MAJOR.MINOR)
npm run app:publish:major           # 2.x → 3.0
npm run app:publish:rebuild         # no bump — rebuild the current version
npm run app:publish:draft           # bump + upload as a DRAFT (never goes live)
```

What the command does, in order (each step is skipped if an earlier one fails):

1. **Preflight** — gradle wrapper, `java`, `android/keystore.properties`, Play
   service account. Nothing is bumped or built until these pass.
2. `node scripts/app-release.mjs <mode>` — bumps `version.json` and rewrites
   `capacitor.config.ts`, `android/app/build.gradle` and the iOS `pbxproj`.
3. `npm run build` + `npx cap sync android` — SvelteKit build into `build/`.
4. `android/gradlew bundleRelease` — `android/app/build/outputs/bundle/release/app-release.aab`.
5. `scripts/play-publish.mjs` — Play Developer API: create edit → upload bundle
   → patch track → commit. The uploaded `versionCode` is checked against
   `version.json`, and a stale/unsigned bundle aborts **before** release.

Common options (pass after `--` when using an npm script):

```bash
npm run app:publish -- --dry-run                       # plan only, nothing written
npm run app:publish -- --status draft                  # rehearse via the real pipeline
npm run app:publish -- --track internal                # internal testing track
npm run app:publish -- --fraction 0.1                  # 10% staged rollout
npm run app:publish -- --notes "Trail fixes, faster maps"
npm run app:publish -- --notes-file docs/release-notes.txt
npm run app:publish -- --build-only                    # stop after the AAB exists
npm run app:publish -- --commit --push                 # commit + push version files
npm run app:publish -- 297 --no-gradle                 # upload an existing AAB as code 297
```

`npm run app:publish:upload` uploads the AAB that is already on disk without
bumping or rebuilding (same options as above). `npm run app:publish:check`
reports the current track contents and proves the service account works.
`npm run app:publish:promote -- <versionCode>` moves a version that is already
on Play (e.g. a draft or an internal-testing build) to a live release without
re-uploading it — Play rejects a second bundle with the same versionCode.

### Draft → rollout workflow

```bash
npm run app:publish:rebuild -- --status draft   # upload only; nothing goes live
# review it in Play Console if you want, then either:
npm run app:publish:promote -- 297              # full production rollout
npm run app:publish:promote -- 297 --fraction 0.1   # or 10% staged
```

If you rebuild after a draft upload, the versionCode is already taken — bump to
a new version (`npm run app:publish`) instead of re-uploading the same one.

---

## One-time setup

### 1. Upload key (`android/keystore.properties`)

`bundleRelease` must be signed, otherwise Play rejects the upload. The file is
git-ignored, and `storeFile` is resolved **relative to `android/app/`** unless
you give an absolute path. Use forward slashes — a Gradle properties file
treats `\` as an escape character.

```properties
# android/keystore.properties
storeFile=../../android-keystore.jks
storePassword=<password>
keyAlias=<alias>
keyPassword=<password>
```

Finding the values:

```powershell
# lists the alias, and the SHA-1/SHA-256 fingerprints (prompts for the password)
& "C:\Program Files\Java\jdk-21\bin\keytool.exe" -list -v -keystore android-keystore.jks
```

Or let the helper do it — it prompts for the password without echoing it,
verifies it, and writes the file:

```bash
npm run app:setup-key                     # prompts if the keystore has several keys
npm run app:setup-key -- --alias key0     # pick one up front
npm run app:setup-key -- --force --alias android-keystore   # switch later
```

- The repo root already has `android-keystore.jks` (it is actually a PKCS12
  file despite the extension). If it is the key you have been signing releases
  with, that is the upload key — point `storeFile` at it.
- Confirm it matches Play: Play Console → **Setup → App signing** shows the
  SHA-1/SHA-256 of the app signing key and of the upload certificate. The
  upload certificate fingerprint must equal the `keytool` output above. If it
  does not, this keystore is not registered as the upload key — either export
  the registered upload key or request an upload key reset in Play Console.
- `keyAlias` is usually the alias printed by `keytool` (often `upload` or
  `key0`); store and key passwords are often identical for a PKCS12 file.
- If the keystore holds **two** keys (e.g. `android-keystore` and `key0`), only
  the one matching Play's upload certificate works. Compare the SHA-256 printed
  by `app:setup-key`/`keytool` with Play Console → **Setup → App signing →
  upload certificate**, then re-run `app:setup-key -- --force --alias <that>`.
  If you get it wrong, Play rejects the upload with a message naming the
  expected certificate — nothing is published, so it is safe to switch and retry.

#### This repo's keys (verified 2026-10-27)

`scripts/play-signing.json` records the fingerprints from Play Console, and
both `app:setup-key` and the release preflight compare against it:

| Play Console | SHA-256 |
|--------------|---------|
| App signing key (Google-held, also in `static/.well-known/assetlinks.json`) | `61:35:BA:29:…:D6:9C:1F` |
| **Upload key** → alias **`android-keystore`** | `6E:C9:34:D4:…:5E:3F:66` |

`android-keystore` is the alias to use. The `key0` entry in the same keystore
(`06:FE:2E:C7:…`) matches no Play certificate — it must not sign releases.
`npm run app:setup-key` now selects the matching alias automatically, and the
preflight refuses to build if `keyAlias` points at the wrong key.

If you ever reset the upload key, update `uploadSha256`/`uploadAlias` in
`scripts/play-signing.json` to the new values.

Verify it works before releasing:

```bash
npm run app:publish -- --build-only     # prints "... signed"
```

### 2. Play Developer API service account

1. **Google Cloud Console** → [create or pick a project](https://console.cloud.google.com/projectcreate)
   (e.g. `agskan-play`).
2. **Enable the API**: open the [Google Play Android Developer API page](https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/)
   and click **Enable**. (Without this every call fails with
   *"API has not been used … or is disabled"*.)
3. **IAM & Admin → Service accounts → Create service account** in that project.
   Name it e.g. `agskan-play-publisher`, skip the "grant this service account
   access" step, and click **Done** — Play permissions are granted in Play
   Console, not via IAM roles.
4. Open the new service account → **Keys → Add key → Create new key → JSON**.
   The key downloads once; you cannot download it again.
5. Save it as `android/play-service-account.json` (git-ignored), or point to it
   with an environment variable:

```powershell
$env:PLAY_SERVICE_ACCOUNT_JSON = "C:\keys\agskan-play.json"
```

6. **Play Console → Users and permissions → Invite new users**, paste the
   service-account email (`...@....iam.gserviceaccount.com`), then
   **App permissions → add app → AgSKAN**:
   - tick *Release to production, exclude devices, and use Play App Signing*;
   - tick *Release to testing tracks* if you use `--track internal/beta`;
   - leave **Account permissions** empty unless you want the API to see
     financial data (required only for the Billing APIs).
   Click **Invite user**.

Permissions usually take effect within a few minutes. The service account will
show up as a user with 0 app installs — that is expected.

Shortcut for steps 1–4 if you have `gcloud` (still do step 6 in the browser):

```bash
gcloud services enable androidpublisher.googleapis.com
gcloud iam service-accounts create agskan-play-publisher --display-name="AgSKAN Play publisher"
gcloud iam service-accounts keys create android/play-service-account.json \
  --iam-account=agskan-play-publisher@<PROJECT_ID>.iam.gserviceaccount.com
```

The key can also be supplied per run with `--credentials <path>`. The
credential search order is `--credentials` → `PLAY_SERVICE_ACCOUNT_JSON` →
`GOOGLE_APPLICATION_CREDENTIALS` → `android/play-service-account.json`.

Verify the credentials without releasing anything:

```bash
npm run app:publish:check
```

That mints a token, lists the app's tracks (production/internal/…), and prints
them — read-only, nothing is uploaded. `npm run app:publish -- --dry-run` is
the lighter check that only inspects local files.

### Troubleshooting the API setup

The scripts translate these for you, but in short:

| Error | Meaning / fix |
|-------|----------------|
| `invalid_grant: account not found` | The JSON key is wrong, revoked, or from a different service account than the one invited. |
| `API has not been used … or is disabled` | Enable the *Google Play Android Developer API* in the Cloud project (step 2). |
| `project id … has not been linked` | Older error: Play Console → **Setup → API access** → **Link a Google Cloud project**. |
| `PERMISSION_DENIED` / `does not own the application` | The service account has no app permission — redo step 6 and tick the release boxes. |
| `409` on release | Another edit is open (Play Console UI or an earlier crashed run). Finish/discard it in **Publishing overview**, or wait ~1 hour. |
| `Play automatic protection requires a minimum SDK version of 24` | `minSdkVersion` in `android/variables.gradle` is too low; raise it to 24 (or higher), rebuild, re-upload. The rejected versionCode is not consumed. |

**"Service account key creation is disabled"** (`iam.managed.disableServiceAccountKeyCreation`)
is a Google Cloud organisation policy, not a Play Console setting — Workspace
domains get this baseline constraint enforced automatically. Three ways out:

1. **Relax it (fastest if you own the domain).** You need the
   *Organisation Policy Administrator* role (`roles/orgpolicy.policyAdmin`) on
   the organisation. Then open
   [Org policies → Disable service account key creation](https://console.cloud.google.com/iam-admin/orgpolicies/iam-managed.disableServiceAccountKeyCreation)
   → **Manage policy** → **Override parent's policy** / **Enforcement: Off** →
   **Set policy**. From Cloud Shell:
   ```bash
   gcloud org-policies describe iam.managed.disableServiceAccountKeyCreation --effective
   gcloud org-policies reset iam.managed.disableServiceAccountKeyCreation --organization=<ORG_ID>
   ```
   (If the constraint appears "managed" and cannot be overridden at project
   level, apply the change at the organisation root.)
   If `gcloud` answers `Permission 'orgpolicy.policies.create' denied`, you are
   not an org policy admin — find who is with
   `gcloud organizations get-iam-policy <ORG_ID>` (or just use option 2 below).
2. **Use a project outside the organisation.** Sign in to
   [console.cloud.google.com](https://console.cloud.google.com) with a **personal
   Gmail** account (no Workspace → no baseline policy), create the project,
   enable the API, and create the service account + JSON key there. Play Console
   only cares about the service account *email* you invite, not which project or
   organisation it lives in.
3. **Go keyless instead.** Run the release in CI with Workload Identity
   Federation + `iamcredentials.generateAccessToken` impersonation, or grant an
   OAuth client for user-based access (Play Console → **Setup → API access**).
   Both avoid downloadable keys; they need code/runners beyond this repo's
   laptop flow.

### 3. Android Studio (optional)

Nothing in the release path needs the Studio UI, but for local debugging:

- **Build → Generate Signed App Bundle** still works and uses the same
  `keystore.properties` values.
- Use `npm run app:publish -- --build-only` to produce the exact bundle the
  command uploads, then **Build → Analyze APK/Bundle** to inspect it.
- Gradle needs a JDK: Android Studio's *Settings → Build Tools → Gradle →
  Gradle JDK* (or `JAVA_HOME`) must be set in the terminal you run npm from.

---

## Notes and guardrails

- **Play SDK floors.** `minSdkVersion` must be at least 24 (Play rejects the
  upload otherwise) and `targetSdkVersion` must be at least 36 for updates
  (Play rejects the *review* otherwise — the "App must target Android 16
  (API level 36) or higher" policy item). Both live in
  `android/variables.gradle`; the preflight prints them and warns when they
  fall below the values in `PLAY_MIN_SDK` / `PLAY_MIN_TARGET_SDK`
  (`scripts/app-release-play.mjs`). Google raises the target requirement every
  31 August — update that constant once a year.
- A policy item about the target API level is judged against the **release that
  is live**, so it clears only after a compliant version is rolled out (a draft
  does not change it).

- **Version numbers** stay `MAJOR.MINOR` names with `versionCode = MAJOR*100 + MINOR`
  (see `scripts/app-release.mjs`). Play rejects a reused `versionCode`, so never
  re-upload a version that is already live — use a new bump.
- **One open edit at a time.** If the Play Console web UI (or a crashed run)
  leaves an edit open, the API answers `409`. Finish/discard it in
  **Publishing overview**, or wait for it to expire (about an hour).
- **Failed runs are safe.** The script discards its edit on any error, so a
  failure never leaves a half-configured release behind.
- **Staged rollouts**: `--fraction 0.1` publishes 10% and keeps the release
  `inProgress`. Increase it from Play Console afterwards.
- **Review time**: a full production rollout still needs Google's review before
  users see it; internal testing is instant.
- **CI**: the same command runs headless — mount the keystore and service
  account JSON as CI secrets/files and run `npm run app:publish -- --no-web-build`
  if the web build already ran.
- **iOS is separate**: bump once here, then on the Mac run
  `npm run build:app:rebuild` and archive (never bump twice).
