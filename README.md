# Naxora

**An image-first AI shopping partner that sees your latest look, recommends what is missing, lets you try products on, and takes you to the real item.**

Naxora combines conversational styling, visual product discovery, and virtual try-on in one evolving shopping session. Upload what you are wearing, add a product or hairstyle reference, and keep refining the same visual state. Every recommendation and API call uses the newest generated look.

> Built for the YouCam API hackathon with Perfect Corp APIs and Gemini multimodal analysis.

## What makes it different

- **Agent-first workflow:** people describe what they want while the agent chooses the next tool.
- **Latest-look memory:** each successful try-on becomes the source image for the next action.
- **Non-destructive experiments:** clothing updates the canonical outfit, while shoes, hair, and jewelry remain previews so a generative engine cannot erase earlier progress.
- **Automatic API routing:** uploaded images are recognized as clothing, shoes, hairstyles, earrings, necklaces, watches, bracelets, or rings.
- **Personal color profile:** an optional face photo detects skin, hair, eye, and lip colors for better recommendations.
- **Buyable recommendations:** suggested pieces link to live shopping results.
- **Visual undo and redo:** users can explore alternatives without losing earlier looks.
- **Session shopping list:** every uploaded, recommended, and tried item stays in a checkable list with its price and purchase link when available.
- **Plain-language interface:** technical API terminology stays out of the shopping experience.

## User flow

1. Add a photo of what you are wearing.
2. Ask Naxora to rate it or recommend the most useful next piece.
3. Add an uploaded or recommended product.
4. Let Naxora choose the appropriate virtual try-on engine.
5. Continue from the generated image, compare alternatives, or open the product page to buy.

## Technology

- React 19 and Vite
- Express 5
- Gemini multimodal image analysis
- Perfect Corp YouCam AI Clothes, Shoes, Hair Transfer, jewelry VTO, and Skin Tone Analysis APIs
- Google Shopping results through SerpAPI, with store-search fallbacks in demo mode

## Quick start

Requirements: Node.js 20 or newer and npm.

```bash
git clone https://github.com/YOUR_USERNAME/naxora.git
cd naxora
cp .env.example .env
npm install
npm start
```

Open `http://127.0.0.1:5173` for development. To run the production build locally:

```bash
npm run build
npm run server
```

Then open `http://127.0.0.1:8787`.

Windows PowerShell users can replace `npm` with `npm.cmd` and copy the environment file with `Copy-Item .env.example .env`.

## Deploying to Vercel

1. Import the GitHub repository into Vercel.
2. Keep the detected Vite build command (`npm run build`) and `dist` output directory.
3. Add `YOUCAM_API_KEY`, `GEMINI_API_KEY`, and optionally `SERPAPI_API_KEY` in Project Settings → Environment Variables.
4. Deploy. Requests under `/api/*` are routed to the Express Vercel Function; all other routes use the Vite app.

Vercel Functions limit request and response bodies to 4.5 MB, so Naxora restricts uploaded images to 4 MB. Compress large phone photos before uploading. Do not add secrets to `vercel.json` or expose them as `VITE_*` variables.

## Configuration

```dotenv
YOUCAM_API_KEY=your_youcam_api_key
GEMINI_API_KEY=your_gemini_api_key
SERPAPI_API_KEY=optional_google_shopping_serpapi_key
PORT=8787
```

All credentials remain on the Express server. Never prefix secrets with `VITE_`, commit `.env`, or place provider keys in frontend code.

- Without Gemini, Naxora returns demo styling recommendations and uses filename-based product classification.
- Without SerpAPI, shopping cards link to Google and store searches.
- Perfect Corp features require an enabled API key and sufficient units for each selected engine.

## API overview

The browser communicates only with the local Naxora server:

- `POST /api/style/classify-product`
- `POST /api/style/analyze-images`
- `GET /api/shop/search`
- `POST /api/youcam/upload`
- `POST /api/youcam/vto`
- `GET /api/youcam/vto/:taskId`
- `POST /api/youcam/colors`
- `GET /api/youcam/colors/:taskId`

The server validates image types and sizes, rate-limits API traffic, blocks private-network image fetching, and keeps provider credentials out of browser responses.

## Privacy and production readiness

Naxora currently processes uploads in memory and does not intentionally save them to disk. Submitted images are still sent to configured AI providers. Before a public production launch, add user authentication, distributed rate limiting, explicit consent, data-retention controls, observability, and provider-specific privacy disclosures.

See [SECURITY.md](SECURITY.md) for reporting and deployment guidance.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and follow the [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.

## License

Naxora is available under the [MIT License](LICENSE).
