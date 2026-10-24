/**
 * `npm run setup:env -- <project-ref>` — writes .env.local for that project.
 *
 * Fetches the project's API keys with the Supabase CLI (the user must already
 * be signed in), keeps only the browser-safe one and writes the two values the
 * app needs. The output names the kind of key used and nothing else: the CLI's
 * response also contains the project's secret keys, and those must not reach a
 * terminal, a log or a chat transcript.
 *
 * Refuses to overwrite an existing .env.local unless `--force` is given.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'

import { envFileContents, pickBrowserKey } from './setup-check-lib.mjs'

const projectRef = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
const force = process.argv.includes('--force')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!projectRef || !/^[a-z0-9]{20}$/.test(projectRef)) {
  fail(
    'Usage: npm run setup:env -- <project-ref>   (the 20-character ref of your Supabase project)',
  )
}
if (existsSync('.env.local') && !force) {
  fail('.env.local already exists. Re-run with --force to replace it.')
}

let output
try {
  output = execFileSync(
    'npx',
    ['supabase', 'projects', 'api-keys', '--project-ref', projectRef, '-o', 'json'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
} catch (error) {
  // stderr carries the CLI's own explanation (not signed in, no access, ...);
  // stdout is not echoed because it may hold keys.
  fail(
    `Could not read the project's API keys: ${String(error?.stderr ?? error?.message ?? error)
      .trim()
      .slice(0, 300)}`,
  )
}

let keys
try {
  keys = JSON.parse(output.slice(output.search(/[[{]/)))
} catch {
  fail('The Supabase CLI returned something that is not JSON. Update it with npm ci and try again.')
}

const chosen = pickBrowserKey(Array.isArray(keys) ? keys : keys?.keys)
if (!chosen) fail('No publishable or anon key was found for that project.')

writeFileSync('.env.local', envFileContents(projectRef, chosen.value), { mode: 0o600 })
console.log(
  `Wrote .env.local for project ${projectRef} using its ${chosen.kind === 'publishable' ? 'publishable' : 'legacy anon'} key.`,
)
