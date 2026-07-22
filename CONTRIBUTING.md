# Contributing to Naxora

Thanks for helping make agent-first shopping more useful and approachable.

## Before you start

- Open an issue for substantial features or architectural changes.
- Never include API keys, user photos, generated try-on results, or other personal data in issues or commits.
- Keep the interface image-first and use plain, non-technical language.
- Preserve the rule that every AI and try-on request uses the latest look.

## Local development

1. Fork and clone the repository.
2. Copy `.env.example` to `.env` and add only the credentials you need.
3. Install dependencies with `npm install`.
4. Run the client and server with `npm start`.
5. Open `http://127.0.0.1:5173`.

Before submitting a pull request, run:

```bash
npm run build
node --check server/index.js
```

## Pull requests

- Keep each pull request focused on one change.
- Explain the user-facing impact and include screenshots for visual changes.
- Describe which APIs were exercised and whether demo mode was used.
- Update documentation when behavior, setup, or environment variables change.
- Do not commit generated `dist`, dependencies, logs, or `.env` files.

By contributing, you agree that your contributions are licensed under the MIT License.
