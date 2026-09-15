# AI background lab

Public entry: /lab/ (same existing Render service).
Required Render environment variables:
- CLOUDFLARE_ACCOUNT_ID: account ID, 32 hex characters
- CLOUDFLARE_API_TOKEN: Workers AI Read/Edit token scoped to that account

Use Cloudflare Workers Free. Do not expose the token in HTML, JavaScript, URLs, or the repository.
The lab is usable for cutout extraction before credentials are configured; generation returns 503 with a clear message until connected.

Flow: 1–3 JPG/PNG images (20MB each) -> local slicing and rembg -> user confirms one cutout -> 3 FLUX.1 Schnell backgrounds (4 steps) -> original RGBA product composited -> 15s H.264/AAC MP4.
No uploaded image is sent to Cloudflare. Only a validated color palette and preset English mood description are sent.
No silent non-AI fallback. Rate/quota failures are displayed. This beta caps render starts at 30 per UTC day (saved on the service disk; ephemeral disk resets may reset it). Cloudflare's own Free-plan limit remains authoritative.
Extraction and rendering share the existing app's render queue. Up to 3 pending lab tasks; one pending job per browser client. Result URLs contain random UUIDs and act as capability links. No public job listing. Files expire after about 2 hours; Render restarts can remove ephemeral files earlier.

Verification completed without live credentials: API response validation tests, 15-second 1080x1920 encoder output, page layout. Real Cloudflare generation must be verified after credentials are configured.
