/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

import packageJson from './package.json' with { type: 'json' }

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

import { PRODUCT_BRAND } from './src/lib/config/brand.ts'

/**
 * Fills `%VITE_APP_NAME%` in `index.html` (title, meta description) with the
 * same value the running app uses — `VITE_APP_NAME` if a deployment set one,
 * `PRODUCT_BRAND.name` otherwise. Vite's built-in `%ENV_VAR%` HTML replacement
 * leaves the placeholder text in place when the variable is unset, which would
 * put a literal "%VITE_APP_NAME%" in the browser tab; this plugin applies the
 * same fallback `getAppName()` already uses in src/lib/config/env.ts instead.
 */
function htmlAppNamePlugin(appName: string): Plugin {
  return {
    name: 'atlas-html-app-name',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replaceAll('%VITE_APP_NAME%', appName)
      },
    },
  }
}

function publicSeoPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'swahivo-public-seo',
    apply: 'build',
    async closeBundle() {
      const origin = 'https://car.swahivo.com'
      const pages = [
        {
          path: '/',
          title: 'Swahivo | Buy, Sell & Rent Cars in East Africa',
          description:
            'Discover cars for sale and rent. Connect with automotive businesses on Swahivo. East Africa based Zanzibar, Tanzania.',
        },
        {
          path: '/cars',
          title: 'Cars for Sale | Swahivo',
          description:
            'Explore new and used vehicles from approved dealerships. Contact a seller to enquire about a car.',
        },
        {
          path: '/rentals',
          title: 'Car Hire & Rental Vehicles | Swahivo',
          description:
            'Search available rental vehicles for your dates and request a booking with the provider.',
        },
        {
          path: '/pricing',
          title: 'Business Plans | Swahivo',
          description:
            'Explore plans for dealerships and rental businesses. Register your business, choose a plan and complete any required payment.',
        },
        {
          path: '/register',
          title: 'Create Your Account | Swahivo',
          description: 'Join Swahivo as a buyer or register your dealership or rental business.',
        },
      ]
      if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY) {
        const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: false },
        })
        const result = await db
          .from('marketplace_catalogue')
          .select('slug,title,service,business_name')
          .limit(10000)
        if (result.error) throw new Error('SEO catalogue retrieval failed: ' + result.error.message)
        for (const row of result.data ?? []) {
          const slug = String(row.slug)
          if (!/^[a-z0-9-]+$/.test(slug)) continue
          pages.push({
            path: `/${row.service === 'rental' ? 'rentals' : 'cars'}/${slug}`,
            title: `${String(row.title)} | Swahivo`,
            description: `${String(row.title)}. Contact ${String(row.business_name)} through Swahivo for details and availability.`,
          })
        }
      }
      const escape = (s: string) =>
        s.replace(
          /[&<>"']/g,
          (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
        )
      const template = await readFile('dist/index.html', 'utf8')
      for (const page of pages) {
        let html = template
          .replace(/<title>[^<]*<\/title>/, `<title>${escape(page.title)}</title>`)
          .replace(/(<meta\s+name="description"\s+content=")[^"]*/, `$1${escape(page.description)}`)
          .replace(/(<meta\s+property="og:title"\s+content=")[^"]*/, `$1${escape(page.title)}`)
          .replace(
            /(<meta\s+property="og:description"\s+content=")[^"]*/,
            `$1${escape(page.description)}`,
          )
          .replace(/(<link rel="canonical" href=")[^"]*/, `$1${origin}${page.path}`)
          .replace(/(<meta property="og:url" content=")[^"]*/, `$1${origin}${page.path}`)
        html = html.replace(
          '<div id="root"></div>',
          `<div id="root"><main id="main"><h1>${escape(page.title.replace(' | Swahivo', ''))}</h1><p>${escape(page.description)}</p><nav><a href="/">Swahivo</a> · <a href="/cars">Cars for sale</a> · <a href="/rentals">Car rentals</a> · <a href="/pricing">Business plans</a> · <a href="/register">Register</a></nav></main></div>`,
        )
        const directory = page.path === '/' ? 'dist' : `dist${page.path}`
        await mkdir(directory, { recursive: true })
        await writeFile(`${directory}/index.html`, html)
      }
      await writeFile(
        'dist/sitemap.xml',
        '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
          pages.map((p) => `<url><loc>${origin}${escape(p.path)}</loc></url>`).join('') +
          '</urlset>',
      )
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const appName = env.VITE_APP_NAME || PRODUCT_BRAND.name

  return {
    plugins: [react(), tailwindcss(), htmlAppNamePlugin(appName), publicSeoPlugin(env)],
    /*
     * The version the About panel shows, taken from package.json at build time.
     *
     * Inlined as a constant rather than imported: importing the manifest would put
     * the whole dependency list in the browser bundle to display one string, and
     * declaring the version a second time in source would let the two drift until
     * the product told somebody the wrong one.
     */
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: false,
    },
    build: {
      // Hostinger serves the built `dist/` directory as static assets.
      outDir: 'dist',
      /*
       * No source maps in the production bundle.
       *
       * Nothing consumes them: there is no error-monitoring service on this
       * deployment, so the only reader would be somebody with the site open in
       * developer tools. What they would get is the entire annotated source —
       * including the comments that explain where each authorization boundary is
       * and why. That is a reconnaissance aid, not a debugging aid, and it also
       * roughly triples what has to be uploaded.
       *
       * `vite dev` is unaffected: the dev server always serves maps, whatever
       * this says. Set it back to true (or 'hidden', which emits the files
       * without advertising them) only alongside something that actually reads
       * them.
       */
      sourcemap: false,
      target: 'es2022',
      // Routes are lazy-loaded, so the entry chunk is the unavoidable runtime:
      // React, the router, TanStack Query and the Supabase client. It sits just
      // above the 500 kB default (~147 kB gzipped); raising the threshold keeps
      // the warning meaningful instead of firing on every build.
      //
      // One chunk exceeds it on purpose: @react-pdf's renderer, at roughly 1.3 MB.
      // It is imported dynamically and only when somebody actually produces a
      // contract PDF, so nobody downloads a PDF engine to look at a list. The
      // warning is expected for that chunk and for no other.
      chunkSizeWarningLimit: 600,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}', 'supabase/tests/**/*.test.ts'],
      // Schema tests boot a real PostgreSQL (WASM) instance and apply every migration.
      testTimeout: 30_000,
      hookTimeout: 180_000,
      restoreMocks: true,
    },
  }
})
