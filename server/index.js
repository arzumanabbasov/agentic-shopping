import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import net from 'node:net';

const app = express();
const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 10, fields: 30 },
  fileFilter: (req, file, callback) => callback(null, allowedImageTypes.has(file.mimetype))
});
const PORT = Number(process.env.PORT || 8787);
const YOUCAM_BASE = 'https://yce-api-01.makeupar.com';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

app.use(express.json({ limit: '2mb' }));
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  next();
});

const rateBuckets = new Map();
app.use('/api', (req, res, next) => {
  const now = Date.now();
  if (rateBuckets.size > 10_000) {
    for (const [bucketKey, value] of rateBuckets) {
      if (now - value.startedAt > 60_000) rateBuckets.delete(bucketKey);
    }
  }
  const key = req.ip || 'unknown';
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt > 60_000) {
    rateBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 90) return res.status(429).json({ error: 'Too many requests. Wait a moment and try again.' });
  next();
});

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    const error = new Error(`${name} is not configured`);
    error.status = 400;
    throw error;
  }
  return value;
}

async function youcamFetch(path, options = {}) {
  const token = requireEnv('YOUCAM_API_KEY');
  const response = await fetch(`${YOUCAM_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status >= 400) {
    const error = new Error(payload?.data?.error || payload?.error || `YouCam request failed: ${response.status}`);
    error.status = response.status;
    error.details = payload;
    throw error;
  }
  return payload;
}

const featureConfig = {
  clothes: { version: 'v2.0', file: 'cloth-v3', task: 'cloth-v3', reference: 'single' },
  shoes: { version: 'v2.0', file: 'shoes', task: 'shoes', reference: 'single' },
  hairstyle: { version: 'v2.1', file: 'hair-transfer', task: 'hair-transfer', reference: 'single' },
  earrings: { version: 'v2.0', file: '2d-vto/earring', task: '2d-vto/earring', reference: 'multiple' },
  necklace: { version: 'v2.0', file: '2d-vto/necklace', task: '2d-vto/necklace', reference: 'multiple' },
  watch: { version: 'v2.0', file: '2d-vto/watch', task: '2d-vto/watch', reference: 'multiple' },
  bracelet: { version: 'v2.0', file: '2d-vto/bracelet', task: '2d-vto/bracelet', reference: 'multiple' },
  ring: { version: 'v2.0', file: '2d-vto/ring', task: '2d-vto/ring', reference: 'multiple' }
};

function getFeature(feature = 'clothes') {
  return featureConfig[feature] ? feature : 'clothes';
}

async function uploadToYouCam(file, feature = 'clothes') {
  const config = featureConfig[getFeature(feature)];
  const init = await youcamFetch(`/s2s/${config.version}/file/${config.file}`, {
    method: 'POST',
    body: JSON.stringify({
      files: [
        {
          content_type: file.mimetype,
          file_name: file.originalname,
          file_size: file.size
        }
      ]
    })
  });
  const record = init?.data?.files?.[0];
  const request = record?.requests?.[0];
  if (!record?.file_id || !request?.url) throw new Error('YouCam did not return an upload URL');

  const put = await fetch(request.url, {
    method: request.method || 'PUT',
    headers: request.headers || { 'Content-Type': file.mimetype, 'Content-Length': String(file.size) },
    body: file.buffer
  });
  if (!put.ok) throw new Error(`Signed upload failed: ${put.status}`);
  return record.file_id;
}

app.post('/api/youcam/upload', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Missing image file' });
    const feature = getFeature(req.body.feature);
    const fileId = await uploadToYouCam(req.file, feature);
    res.json({ fileId });
  } catch (error) {
    next(error);
  }
});

app.post('/api/youcam/vto', async (req, res, next) => {
  try {
    const { srcFileId, refFileId, srcFileUrl, refFileUrl, garmentCategory = 'auto', feature: requestedFeature = 'clothes', gender = 'male' } = req.body;
    const feature = getFeature(requestedFeature);
    const config = featureConfig[feature];
    if (!(srcFileId || srcFileUrl) || !(refFileId || refFileUrl)) {
      return res.status(400).json({ error: 'Provide a user image and a garment reference' });
    }
    const source = srcFileId ? { src_file_id: srcFileId } : { src_file_url: srcFileUrl };
    const reference = config.reference === 'multiple'
      ? (refFileId ? { ref_file_ids: [refFileId] } : { ref_file_urls: [refFileUrl] })
      : (refFileId ? { ref_file_id: refFileId } : { ref_file_url: refFileUrl });
    const payload = {
      ...(feature === 'clothes' ? { garment_category: garmentCategory } : {}),
      ...(feature === 'shoes' ? { gender: gender === 'female' ? 'female' : 'male', style: 'random' } : {}),
      ...source,
      ...reference
    };
    const started = await youcamFetch(`/s2s/${config.version}/task/${config.task}`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    res.json({ taskId: started?.data?.task_id, feature });
  } catch (error) {
    next(error);
  }
});

app.get('/api/youcam/vto/:taskId', async (req, res, next) => {
  try {
    const feature = getFeature(req.query.feature);
    const config = featureConfig[feature];
    const status = await youcamFetch(`/s2s/${config.version}/task/${config.task}/${encodeURIComponent(req.params.taskId)}`);
    res.json(status.data);
  } catch (error) {
    next(error);
  }
});

app.post('/api/youcam/colors', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Add a clear face photo first' });
    const init = await youcamFetch('/s2s/v2.0/file/skin-tone-analysis', {
      method: 'POST',
      body: JSON.stringify({ files: [{ content_type: req.file.mimetype, file_name: req.file.originalname, file_size: req.file.size }] })
    });
    const record = init?.data?.files?.[0];
    const request = record?.requests?.[0];
    if (!record?.file_id || !request?.url) throw new Error('Color scan could not prepare the photo');
    const put = await fetch(request.url, { method: request.method || 'PUT', headers: request.headers, body: req.file.buffer });
    if (!put.ok) throw new Error('Color scan photo upload failed');
    const started = await youcamFetch('/s2s/v2.0/task/skin-tone-analysis', {
      method: 'POST',
      body: JSON.stringify({ src_file_id: record.file_id })
    });
    res.json({ taskId: started?.data?.task_id });
  } catch (error) { next(error); }
});

app.get('/api/youcam/colors/:taskId', async (req, res, next) => {
  try {
    const status = await youcamFetch(`/s2s/v2.0/task/skin-tone-analysis/${encodeURIComponent(req.params.taskId)}`);
    res.json(status.data);
  } catch (error) { next(error); }
});

function imagePart(file) {
  return {
    inline_data: {
      mime_type: file.mimetype,
      data: file.buffer.toString('base64')
    }
  };
}

async function imageUrlPart(url) {
  await assertPublicImageUrl(url);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`Could not fetch image URL: ${response.status}`);
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  if (!allowedImageTypes.has(contentType.split(';')[0])) throw new Error('Image URL did not return a supported image');
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (declaredSize > 10 * 1024 * 1024) throw new Error('Remote image is larger than 10 MB');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > 10 * 1024 * 1024) throw new Error('Remote image is larger than 10 MB');
  return {
    inline_data: {
      mime_type: contentType.split(';')[0],
      data: buffer.toString('base64')
    }
  };
}

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

async function assertPublicImageUrl(value) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error('Invalid image URL'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Only public HTTPS image URLs are allowed');
  const records = await lookup(parsed.hostname, { all: true });
  if (!records.length || records.some((record) => isPrivateAddress(record.address))) throw new Error('Private image URLs are not allowed');
}

function parseJsonObject(text) {
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Gemini did not return JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

app.post('/api/style/classify-product', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Add a product image first' });
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      const name = req.file.originalname.toLowerCase();
      const category = name.includes('shoe') ? 'shoes' : name.includes('hair') ? 'hairstyle' : name.includes('earring') ? 'earrings' : name.includes('necklace') ? 'necklace' : name.includes('watch') ? 'watch' : name.includes('bracelet') ? 'bracelet' : name.includes('ring') ? 'ring' : 'clothes';
      return res.json({ category, garmentCategory: 'auto', label: category === 'clothes' ? 'clothing' : category, confidence: 0.6, demo: true });
    }
    const prompt = `Look only at this product/reference image. Return strict JSON:
{"category":"clothes|shoes|hairstyle|earrings|necklace|watch|bracelet|ring","garmentCategory":"upper_body|lower_body|full_body|auto","shoeGender":"male|female","label":"short everyday product name","confidence":0.0}
Use hairstyle only when the image is primarily a person's hairstyle intended as a hair reference. Use clothes for all garments, bags, belts, and unknown fashion items. Confidence is 0 to 1.`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, imagePart(req.file)] }] })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Could not recognize that product');
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const result = parseJsonObject(text);
    result.category = getFeature(result.category);
    res.json(result);
  } catch (error) { next(error); }
});

function demoStylist(intent, items) {
  const lowerIntent = String(intent || '').toLowerCase();
  const itemNames = (items || []).map((item) => item.description || item.name || item.type).filter(Boolean).join(', ');
  const isOffice = lowerIntent.includes('office');
  const isDate = lowerIntent.includes('date');
  const isStreet = lowerIntent.includes('street');
  const missing = isOffice ? 'slim black leather belt silver buckle' : isStreet ? 'chunky silver chain necklace' : isDate ? 'low heel black slingback shoes' : 'structured belt or statement shoes';
  return {
    score: items?.length > 2 ? 84 : 76,
    verdict: items?.length > 2
      ? 'The outfit has a real point of view. One sharper accessory would make it feel intentional.'
      : 'Strong base. It needs one intentional finishing piece before it feels styled.',
    read: {
      signal: isOffice ? 'polished, competent, slightly minimal' : isStreet ? 'relaxed, graphic, self-aware' : isDate ? 'warm, confident, not overtrying' : 'clean and flexible',
      risk: items?.length > 2 ? 'The look could become busy if the final piece is too loud.' : 'The base may read unfinished without a focal detail.',
      strongestPart: itemNames || 'The neutral base gives the stylist room to complete the outfit.'
    },
    visualEvidence: [
      'The dark base creates a strong vertical line, but the waist area needs a clearer finishing point.',
      'The outfit reads polished from far away, yet it lacks a small detail that makes the styling feel intentional.',
      'A compact accessory would add structure without competing with the main garment.'
    ],
    missingPieces: [
      {
        category: 'belt',
        query: missing,
        reason: 'Defines the waistline and makes the trousers feel styled instead of accidental.',
        priority: 'high',
        budgetQuery: missing.replace('leather ', ''),
        premiumQuery: `premium ${missing}`
      },
      {
        category: 'shoes',
        query: isStreet ? 'clean white low profile sneakers' : 'pointed black loafers',
        reason: 'Sharpens the silhouette and makes the outfit read more polished.',
        priority: 'medium',
        budgetQuery: isStreet ? 'white low profile sneakers sale' : 'black pointed loafers affordable',
        premiumQuery: isStreet ? 'premium white leather sneakers' : 'designer pointed black loafers'
      },
      {
        category: 'accent',
        query: isOffice ? 'small silver hoop earrings' : 'minimal silver necklace',
        reason: 'Adds a controlled highlight near the face without stealing attention.',
        priority: 'low',
        budgetQuery: isOffice ? 'small silver hoop earrings' : 'minimal silver necklace',
        premiumQuery: isOffice ? 'sterling silver small hoop earrings' : 'sterling silver minimal necklace'
      }
    ],
    notes: [
      `Style intent: ${intent || 'everyday polish'}.`,
      `Analyzed ${items?.length || 0} selected item(s).`
    ]
  };
}

app.post('/api/style/analyze-images', upload.any(), async (req, res, next) => {
  try {
    const intent = req.body.intent || '';
    const userNotes = req.body.userNotes || '';
    const items = JSON.parse(req.body.itemMeta || '[]');
    const imageUrls = JSON.parse(req.body.imageUrls || '[]');
    const uploadedFiles = req.files || [];
    const files = uploadedFiles.filter((file) => ['person', 'garment', 'itemImages', 'items', 'image'].includes(file.fieldname));
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!files.length && !imageUrls.length) {
      return res.status(400).json({ error: 'Upload at least one image for visual analysis' });
    }

    if (!geminiKey) {
      return res.json({
        demo: true,
        visualMode: true,
        ...demoStylist(intent, items),
        notes: [
          'Demo mode: add GEMINI_API_KEY to analyze the uploaded images directly.',
          `Received ${files.length + imageUrls.length} image(s) for visual analysis.`
        ]
      });
    }

    const urlParts = await Promise.all(imageUrls.map(imageUrlPart));

    const prompt = `You are the visual fashion engine for Naxora.
Analyze the actual image(s), not just text. The first image is the latest current look, which may already include previous VTO changes. Treat that latest look as the source of truth. Other images are products the user is considering. Judge the current evolving outfit, identify what works, what clashes, and what one or two product categories would complete it.

Return strict JSON:
{
  "score": number 0-100,
  "verdict": string,
  "visualEvidence": array of 3-5 strings describing specific visible evidence from the image(s),
  "read": { "signal": string, "risk": string, "strongestPart": string },
  "missingPieces": array of 2-4 objects { "category": string, "query": string, "reason": string, "priority": "high"|"medium"|"low", "budgetQuery": string, "premiumQuery": string },
  "notes": array of strings
}

Style intent: ${intent || 'not specified'}.
User context: ${userNotes || 'none'}.
Optional item labels: ${JSON.stringify(items)}.

Every missing piece must be a concrete buyable product query suitable for Google Shopping or Amazon. Do not recommend vague ideas. Prefer visually specific queries like "thin black leather belt silver buckle" over generic queries like "belt".`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              ...urlParts,
              ...files.map(imagePart)
            ]
          }
        ]
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Gemini image analysis failed');
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    res.json(parseJsonObject(text));
  } catch (error) {
    next(error);
  }
});

app.post('/api/style/analyze', async (req, res, next) => {
  try {
    const { intent, items = [], userNotes = '' } = req.body;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) return res.json({ demo: true, ...demoStylist(intent, items) });

    const prompt = `You are a sharp but useful AI fashion stylist for a hackathon app called Naxora.
Return strict JSON with:
{
  "score": number 0-100,
  "verdict": string,
  "read": { "signal": string, "risk": string, "strongestPart": string },
  "missingPieces": array of 2-4 objects { "category": string, "query": string, "reason": string, "priority": "high"|"medium"|"low", "budgetQuery": string, "premiumQuery": string },
  "notes": array of strings
}
The user wants: ${intent || 'not specified'}.
User notes: ${userNotes || 'none'}.
Selected items: ${JSON.stringify(items)}.
Focus on concrete purchasable missing pieces, not vague advice. Make every query suitable for Google Shopping.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || 'Gemini request failed');
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    res.json(parseJsonObject(text));
  } catch (error) {
    next(error);
  }
});

app.get('/api/shop/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (!query) return res.status(400).json({ error: 'Missing query' });
    if (query.length > 160) return res.status(400).json({ error: 'Search is too long' });
    const serpKey = process.env.SERPAPI_API_KEY;
    if (!serpKey) {
      return res.json({
        demo: true,
        products: [
          { title: `Search Google Shopping for ${query}`, price: 'Live search', source: 'Google Shopping', link: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}` },
          { title: `Search Zara for ${query}`, price: 'Store search', source: 'Zara', link: `https://www.google.com/search?q=${encodeURIComponent(`site:zara.com ${query}`)}` },
          { title: `Search ASOS for ${query}`, price: 'Store search', source: 'ASOS', link: `https://www.google.com/search?q=${encodeURIComponent(`site:asos.com ${query}`)}` }
        ]
      });
    }
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_shopping');
    url.searchParams.set('q', query);
    url.searchParams.set('api_key', serpKey);
    const response = await fetch(url);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || 'Shopping search failed');
    const products = (payload.shopping_results || []).slice(0, 6).map((item) => ({
      title: item.title,
      price: item.price,
      source: item.source,
      image: item.thumbnail,
      link: item.product_link || item.link
    }));
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

app.use(express.static(distDir));
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.use((error, req, res, next) => {
  const fieldHint = error.field ? `: ${error.field}` : '';
  const status = error.status || 500;
  const message = status >= 500 && process.env.NODE_ENV === 'production' ? 'The service could not complete that request.' : error.message;
  res.status(status).json({ error: `${message}${fieldHint}` });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Naxora API running on http://127.0.0.1:${PORT}`);
  });
}

export default app;
