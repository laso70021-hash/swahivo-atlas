import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

/**
 * MapLibre, with its worker pointed at a file the build actually emits.
 *
 * From v6 MapLibre finds its worker by resolving `./maplibre-gl-worker.mjs`
 * against its own module URL. Once Vite has bundled the library into a hashed
 * chunk there is no such file beside it, the request 404s, and a map renders
 * with no data. `?worker&url` is MapLibre's documented Vite setup: Vite bundles
 * the worker into a self-contained `.js` file and hands back its real address,
 * so the host needs no special MIME type for `.mjs`.
 *
 * Both maps import the library from here so the worker is set before either
 * constructs one.
 */
maplibregl.setWorkerUrl(workerUrl)

export { maplibregl }
