// find-unused-media.mjs — Audit static media for files no longer referenced
// ==========================================================================
// Scans static/images, static/content (plus loose image files in static/) and
// checks whether each file's name appears anywhere in the code/text corpus
// (src, static, scripts, supabase, root configs/docs). Dynamic references are
// approximated: if the exact name is absent but the name minus trailing digits
// (e.g. "mobiledisplay2" -> "mobiledisplay") appears, the file is reported as
// POSSIBLY USED (pattern) instead of unused — check those by hand.
//
// Generated folders (build/, public/, android assets, .svelte-kit) and
// node_modules are excluded from the corpus so stale copies can't produce
// false "used" results.
//
// Run: node scripts/find-unused-media.mjs
import { readdirSync, readFileSync, statSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const SCAN_DIRS = ['static/images', 'static/content']
const MEDIA_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov', '.webm',
  '.svg', '.ico', '.bmp', '.avif', '.m4v',
])
const TEXT_EXT = new Set([
  '.html', '.htm', '.json', '.css', '.js', '.mjs', '.cjs', '.ts', '.svelte',
  '.md', '.txt', '.svg', '.xml', '.webmanifest', '.yml', '.yaml',
])
const CORPUS_DIRS = ['src', 'static', 'scripts', 'supabase']
const SKIP_DIRS = new Set([
  'node_modules', '.svelte-kit', '.git', 'build', 'public', 'android', 'ios',
  '.vercel', '.venv', '.venv-1', 'icon-art', '.apm', 'dist',
])
const CORPUS_ROOT_FILES = [
  'package.json', 'README.md', 'STYLE.md', 'SECURITY.md',
  'capacitor.config.ts', 'svelte.config.js', 'vite.config.ts', 'vercel.json',
  'tailwind.config.ts', 'postcss.config.js',
]

function walk(dir, onFile, skipDirs) {
  let entries = []
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (skipDirs.has(e.name)) continue
      walk(full, onFile, skipDirs)
    } else if (e.isFile()) onFile(full)
  }
}

// ── candidates ──
const candidates = []
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), (f) => candidates.push(f), new Set())
for (const e of readdirSync(path.join(ROOT, 'static'), { withFileTypes: true })) {
  if (e.isFile() && MEDIA_EXT.has(path.extname(e.name).toLowerCase())) {
    candidates.push(path.join(ROOT, 'static', e.name))
  }
}

// ── corpus ──
let corpus = ''
const addFile = (f) => {
  if (!TEXT_EXT.has(path.extname(f).toLowerCase())) return
  try {
    corpus += readFileSync(f, 'utf8') + '\n'
  } catch {}
}
for (const d of CORPUS_DIRS) walk(path.join(ROOT, d), addFile, SKIP_DIRS)
for (const f of CORPUS_ROOT_FILES) addFile(path.join(ROOT, f))
corpus = corpus.toLowerCase()
console.log(
  `corpus: ${(corpus.length / 1024 / 1024).toFixed(1)} MB of text · ${candidates.length} media files scanned\n`,
)

const used = []
const pattern = []
const unused = []
for (const f of candidates) {
  const name = path.basename(f)
  const lower = name.toLowerCase()
  const size = statSync(f).size
  const rel = f.replace(ROOT + path.sep, '').replace(/\\/g, '/')
  if (
    corpus.includes(lower) ||
    corpus.includes(encodeURIComponent(name).toLowerCase())
  ) {
    used.push({ rel, size })
    continue
  }
  const stem = name.replace(/\.[^.]+$/, '')
  if (stem.length >= 4 && corpus.includes(stem.toLowerCase())) {
    pattern.push({ rel, size, how: stem })
    continue
  }
  const stripped = stem.replace(/[\s_-]*\d+$/, '')
  if (stripped.length >= 4 && corpus.includes(stripped.toLowerCase())) {
    pattern.push({ rel, size, how: stripped })
    continue
  }
  unused.push({ rel, size })
}

const kb = (n) => (n / 1024).toFixed(1)
const total = (arr) => arr.reduce((s, x) => s + x.size, 0)
console.log(`✅ USED (exact name found):      ${used.length} files, ${kb(total(used))} KB`)
console.log(`⚠️  POSSIBLY USED (pattern):     ${pattern.length} files, ${kb(total(pattern))} KB`)
console.log(`❌ UNUSED (no reference found):  ${unused.length} files, ${kb(total(unused))} KB\n`)

if (pattern.length) {
  console.log('── POSSIBLY USED (verify manually) ──')
  for (const p of pattern.sort((a, b) => b.size - a.size)) {
    console.log(`  ${kb(p.size).padStart(9)} KB  ${p.rel}   (matched "${p.how}")`)
  }
  console.log('')
}
if (unused.length) {
  console.log('── UNUSED ──')
  for (const u of unused.sort((a, b) => b.size - a.size)) {
    console.log(`  ${kb(u.size).padStart(9)} KB  ${u.rel}`)
  }
}
