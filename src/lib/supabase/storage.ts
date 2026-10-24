/**
 * `cacheControl` for uploads that hold personal or financial records:
 * identification scans, contracts and signatures, receipts, insurance and
 * financing paperwork.
 *
 * Supabase Storage turns this into `Cache-Control: max-age=<seconds>` for both
 * the browser and its CDN, and the default is an hour. That outlives every
 * signed URL this product mints, so a copy could be served from a cache after
 * the link that fetched it had expired. Zero means no cache may reuse the file
 * without going back to Storage, which refuses an expired link.
 *
 * It is not `private, no-store`: the upload API cannot express that, and the
 * platform may still add its own directives in front of this one. Photos,
 * thumbnails and logos keep the default — caching them is what keeps the fleet
 * list fast, and none of them identifies anybody.
 */
export const SENSITIVE_FILE_CACHE_CONTROL = '0'
