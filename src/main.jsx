import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUp, Check, ExternalLink, ImagePlus, Paperclip, Plus, Redo2, ShoppingBag, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import './styles.css';

const API = import.meta.env.VITE_API_URL || (window.location.port === '5173' ? 'http://127.0.0.1:8787' : '');

const intents = [
  { id: 'office polish', label: 'Work' },
  { id: 'date night', label: 'Date' },
  { id: 'streetwear', label: 'Street' },
  { id: 'event ready', label: 'Event' },
  { id: 'minimal everyday', label: 'Daily' }
];

function categoryToFeature(value = '') {
  const text = String(value).toLowerCase();
  if (text.includes('shoe') || text.includes('sneaker') || text.includes('boot')) return 'shoes';
  if (text.includes('hair')) return 'hairstyle';
  if (text.includes('earring')) return 'earrings';
  if (text.includes('necklace') || text.includes('chain')) return 'necklace';
  if (text.includes('watch')) return 'watch';
  if (text.includes('bracelet') || text.includes('bangle')) return 'bracelet';
  if (text.includes('ring')) return 'ring';
  if (text.includes('belt') || text.includes('bag') || text.includes('hat') || text.includes('scarf')) return 'advice';
  return 'clothes';
}

function itemFromFile(file) {
  return {
    id: crypto.randomUUID(),
    title: file.name.replace(/\.[^.]+$/, ''),
    source: 'upload',
    file,
    preview: URL.createObjectURL(file)
  };
}

async function readApiResponse(response) {
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(response.ok ? 'The server returned an unreadable response.' : 'Restart the app server, then refresh.');
  }
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function App() {
  const fitInputRef = useRef(null);
  const productInputRef = useRef(null);
  const colorInputRef = useRef(null);
  const operationRef = useRef(false);
  const [fit, setFit] = useState(null);
  const [product, setProduct] = useState(null);
  const [intent, setIntent] = useState('office polish');
  const [styleGoal, setStyleGoal] = useState('');
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState([
    { id: crypto.randomUUID(), role: 'agent', kind: 'welcome', text: 'What do you want to wear better?' }
  ]);
  const [style, setStyle] = useState(null);
  const [products, setProducts] = useState([]);
  const [vto, setVto] = useState(null);
  const [canonicalImage, setCanonicalImage] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [colorProfile, setColorProfile] = useState(null);
  const [triedItems, setTriedItems] = useState([]);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);

  const fitPreview = useMemo(() => (fit ? URL.createObjectURL(fit) : ''), [fit]);
  const currentLook = previewResult?.image || canonicalImage || fitPreview;
  const canonicalLook = canonicalImage || fitPreview;

  function addMessage(message) {
    setMessages((current) => [
      ...current.filter((item) => item.kind !== 'welcome'),
      { id: crypto.randomUUID(), ...message }
    ].slice(-30));
  }

  function snapshot() {
    return { fit, product, intent, styleGoal, pendingQuestion, draft, messages, style, products, vto, canonicalImage, previewResult, colorProfile, error };
  }

  function restore(state) {
    setFit(state.fit);
    setProduct(state.product);
    setIntent(state.intent);
    setStyleGoal(state.styleGoal);
    setPendingQuestion(state.pendingQuestion);
    setDraft(state.draft);
    setMessages(state.messages);
    setStyle(state.style);
    setProducts(state.products);
    setVto(state.vto);
    setCanonicalImage(state.canonicalImage);
    setPreviewResult(state.previewResult);
    setColorProfile(state.colorProfile);
    setError(state.error);
  }

  function remember() {
    setPast((current) => [...current.slice(-9), snapshot()]);
    setFuture([]);
  }

  function rememberItem(item, status = 'saved') {
    setTriedItems((current) => {
      const match = current.find((entry) => (item.link && entry.link === item.link) || entry.id === item.id);
      if (match) return current.map((entry) => match.id === entry.id ? { ...entry, ...item, status: entry.status === 'tried' ? 'tried' : status } : entry);
      return [...current, { ...item, status, checked: false, addedAt: Date.now() }];
    });
  }

  function toggleShoppingItem(id) {
    if (busy) return;
    setTriedItems((current) => current.map((item) => item.id === id ? { ...item, checked: !item.checked } : item));
  }

  function removeShoppingItem(id) {
    if (busy) return;
    setTriedItems((current) => current.filter((item) => item.id !== id));
  }

  function undo() {
    setPast((current) => {
      if (!current.length) return current;
      const previous = current[current.length - 1];
      setFuture((items) => [snapshot(), ...items].slice(0, 10));
      restore(previous);
      return current.slice(0, -1);
    });
  }

  function redo() {
    setFuture((current) => {
      if (!current.length) return current;
      const next = current[0];
      setPast((items) => [...items.slice(-9), snapshot()]);
      restore(next);
      return current.slice(1);
    });
  }

  function uploadFit(file) {
    if (!file || busy) return;
    remember();
    setFit(file);
    setVto(null);
    setCanonicalImage('');
    setPreviewResult(null);
    setStyle(null);
    addMessage({ role: 'user', kind: 'image', text: 'This is what I’m wearing', image: URL.createObjectURL(file) });
    setPendingQuestion('occasion');
    addMessage({ role: 'agent', kind: 'question', step: 'occasion', text: 'Where are you going in this outfit?', options: [
      { label: 'Work', value: 'office polish' },
      { label: 'A date', value: 'date night' },
      { label: 'Everyday', value: 'minimal everyday' },
      { label: 'An event', value: 'event ready' },
      { label: 'Just exploring', value: 'open exploration' }
    ] });
  }

  async function uploadProduct(file) {
    if (!file || busy) return;
    const nextProduct = itemFromFile(file);
    remember();
    setProduct(nextProduct);
    addMessage({ role: 'user', kind: 'image', text: 'Would this work with it?', image: nextProduct.preview });
    operationRef.current = true;
    setBusy('recognizing');
    setError('');
    try {
      const body = new FormData();
      body.append('image', file);
      const response = await fetch(`${API}/api/style/classify-product`, { method: 'POST', body });
      const recognized = await readApiResponse(response);
      const identified = { ...nextProduct, ...recognized };
      setProduct(identified);
      rememberItem(identified);
      addMessage({ role: 'agent', kind: 'actions', text: `I recognized this as ${recognized.label || recognized.category}. What should I do with it?`, actions: recognized.category === 'advice' ? ['rate', 'shop'] : ['vto', 'rate', 'shop'] });
    } catch (err) {
      setProduct({ ...nextProduct, category: 'clothes', garmentCategory: 'auto' });
      rememberItem({ ...nextProduct, category: 'clothes', garmentCategory: 'auto' });
      addMessage({ role: 'agent', kind: 'actions', text: 'I’ll treat this as clothing. What should I do with it?', actions: ['vto', 'rate', 'shop'] });
    } finally {
      operationRef.current = false;
      setBusy('');
    }
  }

  function pinProduct(shopProduct) {
    if (busy) return;
    remember();
    const pinned = {
      id: crypto.randomUUID(),
      source: 'shop',
      title: shopProduct.title,
      preview: shopProduct.image || '',
      link: shopProduct.link,
      price: shopProduct.price,
      category: categoryToFeature(shopProduct.query),
      garmentCategory: 'auto'
    };
    setProduct(pinned);
    rememberItem(pinned);
    setProducts([]);
    addMessage({ role: 'user', kind: 'product', text: 'Add this to my look', product: shopProduct });
    addMessage({ role: 'agent', kind: 'actions', text: pinned.category === 'advice' ? 'Saved. I can tell you whether it matches, but this type of item can’t be virtually tried on yet.' : 'Saved to your session. Try it on when you’re ready.', actions: pinned.category === 'advice' ? ['rate'] : ['vto', 'rate'] });
  }

  async function analyze(nextIntent = intent, note = draft) {
    if (operationRef.current) return;
    if (!fit && !product && !vtoImage) {
      setError('Add a photo first so I can see what we’re working with.');
      return;
    }
    operationRef.current = true;
    setBusy('thinking');
    setError('');
    try {
      const body = new FormData();
      body.append('intent', nextIntent);
      body.append('userNotes', `${note}${styleGoal ? `\nOutfit goal: ${styleGoal}` : ''}${previewResult ? '\nThe primary image is a non-destructive preview. Judge whether the previewed item matches, but do not reward changes to the person, pose, background, or unrelated garments.' : ''}${colorProfile ? `\nVerified personal colors: ${JSON.stringify(colorProfile)}` : ''}`);
      body.append('itemMeta', JSON.stringify(triedItems.map((item) => ({ title: item.title, source: item.source, category: item.category, status: item.status, checked: item.checked }))));
      body.append('imageUrls', JSON.stringify(currentLook && currentLook !== fitPreview ? [currentLook] : []));
      if (fit && (!currentLook || currentLook === fitPreview)) body.append('person', fit);
      if (product?.file) body.append('itemImages', product.file);
      const response = await fetch(`${API}/api/style/analyze-images`, { method: 'POST', body });
      const result = await readApiResponse(response);
      remember();
      setIntent(nextIntent);
      setStyle(result);
      setDraft('');
      const topPiece = result.missingPieces?.[0];
      addMessage({ role: 'agent', kind: 'analysis', style: result });
      if (topPiece) addMessage({ role: 'agent', kind: 'recommendation', piece: topPiece });
    } catch (err) {
      setError(err.message);
    } finally {
      operationRef.current = false;
      setBusy('');
    }
  }

  async function searchProducts(piece, mode = 'query') {
    if (operationRef.current) return;
    const query = piece?.[mode] || piece?.query;
    if (!query) return;
    operationRef.current = true;
    setBusy('shopping');
    setError('');
    try {
      const response = await fetch(`${API}/api/shop/search?q=${encodeURIComponent(query)}`);
      const payload = await readApiResponse(response);
      const found = (payload.products || []).map((item) => ({ ...item, query: piece.category }));
      setProducts(found);
      addMessage({ role: 'agent', kind: 'shopping', text: `Here are a few ${piece.category} options. Add one to your look or open it to buy.`, products: found });
    } catch (err) {
      setError(err.message);
    } finally {
      operationRef.current = false;
      setBusy('');
    }
  }

  async function uploadToYouCam(file, feature = 'clothes') {
    const body = new FormData();
    body.append('image', file);
    body.append('feature', feature);
    const response = await fetch(`${API}/api/youcam/upload`, { method: 'POST', body });
    return (await readApiResponse(response)).fileId;
  }

  async function runVto() {
    if (operationRef.current) return;
    if (!product?.file && !product?.preview) {
      setError('Add the clothing item you want to try first.');
      return;
    }
    if (product.category === 'hairstyle' && product.file && product.file.type !== 'image/jpeg') {
      setError('For a hairstyle reference, use a JPG photo with the hair clearly visible.');
      return;
    }
    if (product.category === 'advice') {
      setError('This item can’t be tried on yet. I can still judge whether it matches and keep it in your shopping list.');
      return;
    }
    operationRef.current = true;
    setBusy('trying on');
    setError('');
    try {
      const feature = product.category || 'clothes';
      const srcFileId = fit && !canonicalImage ? await uploadToYouCam(fit, feature) : undefined;
      const refFileId = product?.file ? await uploadToYouCam(product.file, feature) : undefined;
      const response = await fetch(`${API}/api/youcam/vto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srcFileId,
          refFileId,
          srcFileUrl: srcFileId ? undefined : (canonicalLook || 'https://plugins-media.makeupar.com/strapi/assets/clothes_01_10be1e1a9b.png'),
          refFileUrl: refFileId ? undefined : product.preview,
          garmentCategory: product.garmentCategory || 'auto',
          feature,
          gender: product.shoeGender || 'male'
        })
      });
      const payload = await readApiResponse(response);
      remember();
      setVto((current) => ({ ...current, taskId: payload.taskId, feature: payload.feature || feature, task_status: 'processing' }));
      addMessage({ role: 'agent', kind: 'status', text: feature === 'clothes' ? 'Adding it to your saved outfit…' : 'Creating a preview without changing your saved outfit…' });
      pollVto(payload.taskId, payload.feature || feature);
    } catch (err) {
      setError(err.message);
      operationRef.current = false;
      setBusy('');
    }
  }

  async function pollVto(taskId, feature = 'clothes') {
    for (let index = 0; index < 20; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      try {
        const response = await fetch(`${API}/api/youcam/vto/${encodeURIComponent(taskId)}?feature=${encodeURIComponent(feature)}`);
        const payload = await readApiResponse(response);
        setVto((current) => ({ ...current, taskId, feature, ...payload }));
        const image = payload?.results?.url || payload?.results?.[0]?.url || payload?.result_url || payload?.image_url;
        if (payload.task_status === 'success' || payload.task_status === 'error') {
          operationRef.current = false;
          setBusy('');
          if (image) {
            rememberItem(product, 'tried');
            if (feature === 'clothes') {
              setCanonicalImage(image);
              setPreviewResult(null);
              addMessage({ role: 'agent', kind: 'image', text: 'Here’s your updated outfit', image });
            } else {
              setPreviewResult({ image, feature, productId: product.id });
              addMessage({ role: 'agent', kind: 'image', text: `Here’s the ${feature} preview`, image });
            }
          }
          addMessage({ role: 'agent', kind: 'actions', text: image ? (feature === 'clothes' ? 'This is now your saved outfit. Keep going?' : 'I kept your saved outfit unchanged. I can judge this preview or help with the next piece.') : 'I couldn’t try that image. Add a clearer product photo and we’ll try again.', actions: image ? ['rate', 'shop', 'product'] : ['product'] });
          return;
        }
      } catch (err) {
        setError(err.message);
        operationRef.current = false;
        setBusy('');
        return;
      }
    }
    operationRef.current = false;
    setBusy('');
  }

  async function learnColors(file) {
    if (!file || operationRef.current) return;
    operationRef.current = true;
    setBusy('colors');
    setError('');
    addMessage({ role: 'user', kind: 'image', text: 'Use this photo to learn my colors', image: URL.createObjectURL(file) });
    try {
      const body = new FormData();
      body.append('image', file);
      const response = await fetch(`${API}/api/youcam/colors`, { method: 'POST', body });
      const started = await readApiResponse(response);
      for (let index = 0; index < 20; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`${API}/api/youcam/colors/${encodeURIComponent(started.taskId)}`);
        const status = await readApiResponse(statusResponse);
        if (status.task_status === 'success') {
          const colors = status?.results?.color || status?.results;
          remember();
          setColorProfile(colors);
          addMessage({ role: 'agent', kind: 'colors', colors });
          return;
        }
        if (status.task_status === 'error') throw new Error('I couldn’t read that photo. Try a clear, front-facing photo in good light.');
      }
      throw new Error('The color scan took too long. Please try again.');
    } catch (err) {
      setError(err.message);
    } finally {
      operationRef.current = false;
      setBusy('');
    }
  }

  function submitChat(event) {
    event.preventDefault();
    if (busy) return;
    const text = draft.trim();
    if (!text) return;
    if (pendingQuestion) {
      addMessage({ role: 'user', kind: 'text', text });
      setDraft('');
      answerQuestion(pendingQuestion, text, text, true);
      return;
    }
    addMessage({ role: 'user', kind: 'text', text });
    analyze(intent, text);
  }

  function answerQuestion(step, value, label, userMessageAlreadyAdded = false) {
    if (busy) return;
    if (!userMessageAlreadyAdded) addMessage({ role: 'user', kind: 'text', text: label });
    if (step === 'occasion') {
      setIntent(value);
      setPendingQuestion('goal');
      addMessage({ role: 'agent', kind: 'question', step: 'goal', text: 'What do you want this look to do for you?', options: [
        { label: 'Look more polished', value: 'more polished and put together' },
        { label: 'Feel comfortable', value: 'comfortable and easy to wear' },
        { label: 'Stand out', value: 'bold, memorable, and confident' },
        { label: 'Keep it simple', value: 'minimal, clean, and effortless' },
        { label: 'Surprise me', value: 'take a creative risk that still suits me' }
      ] });
      return;
    }
    setStyleGoal(value);
    setPendingQuestion('');
    addMessage({ role: 'agent', kind: 'text', text: `Perfect. I’ll keep “${value}” in mind while we build the look.` });
    addMessage({ role: 'agent', kind: 'actions', text: 'Want my opinion first, or do you already have something to add?', actions: ['rate', 'product'] });
  }

  function runAction(action) {
    if (busy) return;
    if (action === 'fit') fitInputRef.current?.click();
    if (action === 'colors') colorInputRef.current?.click();
    if (action === 'rate') analyze();
    if (action === 'product') productInputRef.current?.click();
    if (action === 'vto') runVto();
    if (action === 'shop' && style?.missingPieces?.[0]) searchProducts(style.missingPieces[0], 'query');
  }

  const actionLabels = {
    rate: 'How does this look?',
    product: 'Add another item',
    vto: 'Try it on me',
    shop: 'Find something for me'
  };

  return (
    <main>
      <section className="chatShell">
        <header className="topBar">
          <div className="brand">
            <span className="mark"><Sparkles size={17} /></span>
            <h1>Naxora</h1>
          </div>
          <div className="topActions">
            <button className="shoppingListButton" onClick={() => setShoppingOpen(true)} disabled={Boolean(busy) || !triedItems.length} aria-label={`Open shopping list with ${triedItems.length} items`} title="Shopping list"><ShoppingBag size={18} />{triedItems.length ? <span>{triedItems.length}</span> : null}</button>
            <button onClick={undo} disabled={!past.length || Boolean(busy)} aria-label="Go back one step" title="Go back one step"><Undo2 size={18} /></button>
            <button onClick={redo} disabled={!future.length || Boolean(busy)} aria-label="Go forward one step" title="Go forward one step"><Redo2 size={18} /></button>
          </div>
        </header>

        <section className="thread">
          {currentLook ? (
            <div className="currentLook">
              <img src={currentLook} alt="Latest look" />
              <div><strong>{previewResult ? 'Previewing an idea' : 'Your current look'}</strong><span>{previewResult ? 'Your saved outfit is unchanged' : 'Every answer uses this photo'}</span></div>
              <Check size={18} />
            </div>
          ) : null}

          {messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              onAction={runAction}
              onSearch={searchProducts}
              onPin={pinProduct}
              actionLabels={actionLabels}
              busy={busy}
              onAnswer={answerQuestion}
              activeQuestion={pendingQuestion}
            />
          ))}
        </section>

        {error ? <div className="error">{error}</div> : null}

        {busy ? <div className="working" role="status"><span className="workingDot" />{busy === 'thinking' ? 'Looking at your outfit…' : busy === 'shopping' ? 'Finding good options…' : busy === 'recognizing' ? 'Checking what you added…' : busy === 'colors' ? 'Learning which colors suit you…' : 'Creating your new look…'}</div> : null}

        <form className="composer" onSubmit={submitChat}>
          <div className="attachRow">
            <button type="button" disabled={Boolean(busy)} onClick={() => fitInputRef.current?.click()}><Paperclip size={17} /> Add my photo</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => productInputRef.current?.click()}><ImagePlus size={17} /> Add an item</button>
            <button type="button" disabled={Boolean(busy)} onClick={() => colorInputRef.current?.click()}><Sparkles size={17} /> Learn my colors</button>
          </div>
          <div className="promptRow">
            <input disabled={Boolean(busy)} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={busy ? 'One moment…' : pendingQuestion === 'occasion' ? 'Tell me where you’re going' : pendingQuestion === 'goal' ? 'Tell me what you want from the look' : 'Ask anything about your look'} />
            <button className="sendButton" type="submit" disabled={!draft.trim() || Boolean(busy)} aria-label="Send"><ArrowUp size={19} /></button>
          </div>
          <input ref={fitInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadFit(event.target.files?.[0])} />
          <input ref={productInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadProduct(event.target.files?.[0])} />
          <input ref={colorInputRef} type="file" accept="image/jpeg" onChange={(event) => learnColors(event.target.files?.[0])} />
        </form>

        {shoppingOpen ? (
          <div className="listBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShoppingOpen(false)}>
            <aside className="shoppingList" role="dialog" aria-modal="true" aria-labelledby="shopping-list-title">
              <header>
                <div><span>Your saved session</span><h2 id="shopping-list-title">Shopping list</h2></div>
                <button onClick={() => setShoppingOpen(false)} aria-label="Close shopping list"><X size={19} /></button>
              </header>
              <p className="listIntro">Everything you considered stays here until you remove it.</p>
              <div className="listItems">
                {triedItems.map((item) => (
                  <article className={item.checked ? 'listItem checked' : 'listItem'} key={item.id}>
                    <button className="listCheck" disabled={Boolean(busy)} onClick={() => toggleShoppingItem(item.id)} aria-label={item.checked ? `Uncheck ${item.title}` : `Check off ${item.title}`}><Check size={15} /></button>
                    {item.preview ? <img src={item.preview} alt="" /> : <span className="listFallback"><ShoppingBag size={18} /></span>}
                    <div><strong>{item.title}</strong><small>{item.price || (item.status === 'tried' ? 'Tried on' : 'Saved to try')}</small></div>
                    {item.link ? <a href={item.link} target="_blank" rel="noreferrer" aria-label={`Buy ${item.title}`}><ExternalLink size={17} /></a> : <a href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(item.title)}`} target="_blank" rel="noreferrer" aria-label={`Find ${item.title} online`}><ExternalLink size={17} /></a>}
                    <button className="listRemove" disabled={Boolean(busy)} onClick={() => removeShoppingItem(item.id)} aria-label={`Remove ${item.title}`}><Trash2 size={16} /></button>
                  </article>
                ))}
              </div>
              <footer><span>{triedItems.filter((item) => item.checked).length} of {triedItems.length} checked off</span><button onClick={() => setShoppingOpen(false)}>Keep styling</button></footer>
            </aside>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function Message({ message, onAction, onSearch, onPin, actionLabels, busy, onAnswer, activeQuestion }) {
  if (message.kind === 'welcome') {
    return (
      <article className="welcome">
        <div className="welcomeVisual" aria-hidden="true">
          <div className="lookPreview">
            <img src="https://plugins-media.makeupar.com/strapi/assets/clothes_01_10be1e1a9b.png" alt="" />
            <span>Your look</span>
          </div>
          <div className="productPreview">
            <img src="https://plugins-media.makeupar.com/strapi/assets/clothes_reference_full_body_01_5a000d999f.png" alt="" />
            <span><Plus size={14} /> Try anything</span>
          </div>
          <span className="visualSpark"><Sparkles size={18} /></span>
        </div>
        <div className="welcomeCopy">
          <span className="eyebrow">Your AI shopping partner</span>
          <h2>{message.text}</h2>
          <p>Start with what you’re wearing, something you want to try, or a quick color check.</p>
        </div>
        <div className="starterGrid">
          <button onClick={() => onAction('fit')}>
            <span className="starterIcon dark"><Paperclip size={18} /></span>
            <span><strong>Add what I’m wearing</strong><small>Get advice and build from there</small></span>
          </button>
          <button onClick={() => onAction('product')}>
            <span className="starterIcon violet"><ImagePlus size={18} /></span>
            <span><strong>Try something I found</strong><small>Clothes, shoes, jewelry, or hair</small></span>
          </button>
          <button onClick={() => onAction('colors')}>
            <span className="starterIcon amber"><Sparkles size={18} /></span>
            <span><strong>Learn my best colors</strong><small>Use a clear photo of your face</small></span>
          </button>
        </div>
      </article>
    );
  }
  if (message.kind === 'image') {
    return (
      <article className={`msg ${message.role}`}>
        <p>{message.text}</p>
        <img className="messageImage" src={message.image} alt="" />
      </article>
    );
  }

  if (message.kind === 'question') {
    return (
      <article className="msg agent questionMessage">
        <p>{message.text}</p>
        {activeQuestion === message.step ? <>
          <div className="quickReplies">
            {message.options.map((option) => <button disabled={Boolean(busy)} key={option.value} onClick={() => onAnswer(message.step, option.value, option.label)}>{option.label}</button>)}
          </div>
          <small>You can also type your own answer below.</small>
        </> : null}
      </article>
    );
  }

  if (message.kind === 'actions') {
    return (
      <article className="msg agent">
        <p>{message.text}</p>
        <div className="actionRow">
          {message.actions.map((action, index) => <button className={index === 0 ? 'primaryAction' : 'secondaryAction'} disabled={Boolean(busy)} key={action} onClick={() => onAction(action)}>{actionLabels[action]}</button>)}
        </div>
      </article>
    );
  }

  if (message.kind === 'analysis') {
    return (
      <article className="msg agent componentMsg analysisCard">
        <div className="scoreCard"><span>How well it works</span><strong>{message.style.score ?? '--'}<small>/100</small></strong></div>
        <p>{message.style.verdict}</p>
        {message.style.visualEvidence?.slice(0, 3).map((line) => <p className="evidence" key={line}>{line}</p>)}
      </article>
    );
  }

  if (message.kind === 'colors') {
    const swatches = [
      ['Skin', message.colors?.skin_color],
      ['Hair', message.colors?.hair_color],
      ['Eyes', message.colors?.eye_color],
      ['Lips', message.colors?.lip_color]
    ].filter(([, color]) => color);
    return (
      <article className="msg agent componentMsg colorCard">
        <span>Your color profile</span>
        <h2>I’ll remember these colors</h2>
        <p>I’ll use them when I choose clothing and accessories for you.</p>
        <div className="colorSwatches">
          {swatches.map(([label, color]) => <div key={label}><i style={{ background: color }} /><span>{label}</span></div>)}
        </div>
      </article>
    );
  }

  if (message.kind === 'recommendation') {
    return (
      <article className="msg agent componentMsg recommendationCard">
        <span>One change I’d make</span>
        <h2>Add {message.piece.category}</h2>
        <p>{message.piece.reason}</p>
        <div className="actionRow">
          <button disabled={Boolean(busy)} onClick={() => onSearch(message.piece, 'query')}>Best match</button>
          <button disabled={Boolean(busy)} onClick={() => onSearch(message.piece, 'budgetQuery')}>Lower price</button>
          <button disabled={Boolean(busy)} onClick={() => onSearch(message.piece, 'premiumQuery')}>Premium</button>
        </div>
      </article>
    );
  }

  if (message.kind === 'shopping') {
    return (
      <article className="msg agent shoppingMessage">
        <p>{message.text}</p>
        <div className="shoppingGrid">
          {message.products.map((product) => (
            <div className="productCard" key={product.link}>
              <button disabled={Boolean(busy)} onClick={() => onPin(product)} aria-label={`Add ${product.title} to my look`}><Plus size={15} /></button>
              <a href={product.link} target="_blank" rel="noreferrer">
                {product.image ? <img src={product.image} alt="" /> : <span className="thumb"><ExternalLink size={18} /></span>}
                <strong>{product.title}</strong>
                <small>{product.price || 'See price'} · {product.source || 'Online'}</small>
              </a>
            </div>
          ))}
        </div>
      </article>
    );
  }

  if (message.kind === 'product') {
    return (
      <article className="msg user componentMsg compactProduct">
        <p>{message.text}</p>
        {message.product.image ? <img src={message.product.image} alt="" /> : null}
        <strong>{message.product.title}</strong>
      </article>
    );
  }

  return <article className={`msg ${message.role}`}><p>{message.text}</p></article>;
}

createRoot(document.getElementById('root')).render(<App />);
