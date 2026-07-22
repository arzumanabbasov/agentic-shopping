# Security Policy

## Reporting a vulnerability

Please do not open a public issue for suspected vulnerabilities. Use GitHub's private vulnerability reporting feature for this repository. Include reproduction steps, affected endpoints, and the potential impact without including real credentials or personal images.

## Supported version

Security fixes are applied to the latest version on the default branch.

## Deployment guidance

- Keep `YOUCAM_API_KEY`, `GEMINI_API_KEY`, and `SERPAPI_API_KEY` on the server only.
- Never expose `.env`, logs, uploaded images, or provider responses publicly.
- Serve production deployments over HTTPS.
- Add authentication, persistent rate limiting, abuse monitoring, and a retention policy before accepting real customer photos.
- Treat outfit, face, hand, and generated images as personal data. Obtain consent and delete them when they are no longer needed.
- Restrict API credentials by environment and rotate them immediately if exposure is suspected.

This hackathon implementation keeps uploads in memory and does not intentionally persist user images, but third-party AI providers process submitted images under their respective terms and policies.
