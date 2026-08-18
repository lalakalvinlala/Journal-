'use client';

import { useEffect, useRef, useState } from 'react';

const MOODS = ['Confident', 'FOMO', 'Regretful'];
const MOOD_COLOR = { Confident: 'forest', FOMO: 'brass', Regretful: 'rust' };
const CATEGORIES = ['Memecoin', 'Stock', 'Other'];

function fmtDate(iso) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      const maxW = 900;
      if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Could not process image')); return; }
          resolve({ blob, previewUrl: canvas.toDataURL('image/jpeg', 0.72) });
        },
        'image/jpeg',
        0.72
      );
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [type, setType] = useState('thought');

  const [tMood, setTMood] = useState(MOODS[0]);
  const [tText, setTText] = useState('');

  const [xAsset, setXAsset] = useState('');
  const [xCategory, setXCategory] = useState(CATEGORIES[0]);
  const [xMood, setXMood] = useState(MOODS[0]);
  const [xNotes, setXNotes] = useState('');

  const [pendingImage, setPendingImage] = useState(null); // { blob, previewUrl }
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    function onPaste(ev) {
      const items = ev.clipboardData && ev.clipboardData.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.indexOf('image') === 0) {
          ev.preventDefault();
          const file = item.getAsFile();
          compressImage(file).then(setPendingImage).catch(() => {});
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/entries');
      const data = await res.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to load entries', e);
    }
    setLoading(false);
  }

  async function handleFileChange(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    try {
      setPendingImage(await compressImage(file));
    } catch (e) {
      console.error(e);
    }
    ev.target.value = '';
  }

  async function handleSubmit() {
    setError('');
    if (type === 'thought' && !tText.trim()) { setError('Write something first.'); return; }
    if (type === 'trade' && !xAsset.trim()) { setError('Name the asset first.'); return; }

    setSubmitting(true);
    try {
      let image_url = null;
      if (pendingImage) {
        const form = new FormData();
        form.append('file', pendingImage.blob, 'screenshot.jpg');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
        if (!uploadRes.ok) throw new Error('Image upload failed');
        const uploadData = await uploadRes.json();
        image_url = uploadData.url;
      }

      const body = type === 'thought'
        ? { type: 'thought', mood: tMood, text: tText.trim(), image_url }
        : { type: 'trade', asset: xAsset.trim(), category: xCategory, mood: xMood, notes: xNotes.trim(), image_url };

      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');

      if (type === 'thought') { setTText(''); } else { setXAsset(''); setXNotes(''); }
      setPendingImage(null);
      await load();
    } catch (e) {
      console.error(e);
      setError('Something went wrong saving that entry.');
    }
    setSubmitting(false);
  }

  async function handleDelete(id) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
      load();
    }
  }

  const filtered = entries
    .filter((e) => filter === 'all' || e.type === filter)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className="wrap">
      <header>
        <p className="eyebrow">Thoughts and positions, pinned up</p>
        <h1>The Pinboard</h1>
      </header>

      <nav className="tabs">
        {[['all', 'Everything'], ['thought', 'Thoughts'], ['trade', 'Trades']].map(([key, label]) => (
          <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="composer">
        <div className="type-toggle">
          <button className={type === 'thought' ? 'active' : ''} onClick={() => { setType('thought'); setError(''); }}>Thought</button>
          <button className={type === 'trade' ? 'active' : ''} onClick={() => { setType('trade'); setError(''); }}>Trade</button>
        </div>

        {type === 'thought' ? (
          <>
            <div className="field-row">
              <div className="field">
                <label>Mood</label>
                <select value={tMood} onChange={(e) => setTMood(e.target.value)}>
                  {MOODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field full">
                <label>What&apos;s on your mind</label>
                <textarea
                  value={tText}
                  onChange={(e) => setTText(e.target.value)}
                  placeholder="Write it down before the feed talks you out of it."
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="field-row">
              <div className="field">
                <label>Asset</label>
                <input value={xAsset} onChange={(e) => setXAsset(e.target.value)} placeholder="e.g. $WIF or AAPL" />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={xCategory} onChange={(e) => setXCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field full">
                <label>Mood</label>
                <select value={xMood} onChange={(e) => setXMood(e.target.value)}>
                  {MOODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="field-row">
              <div className="field full">
                <label>Notes</label>
                <textarea
                  value={xNotes}
                  onChange={(e) => setXNotes(e.target.value)}
                  placeholder="What happened, why, what you're watching."
                />
              </div>
            </div>
          </>
        )}

        <div
          className={`paste-zone ${pendingImage ? 'has-image' : ''}`}
          onClick={() => { if (!pendingImage) fileInputRef.current?.click(); }}
        >
          {pendingImage ? (
            <>
              <img src={pendingImage.previewUrl} alt="Pasted screenshot" />
              <button
                type="button"
                className="paste-remove"
                aria-label="Remove image"
                onClick={(ev) => { ev.stopPropagation(); setPendingImage(null); }}
              >
                ×
              </button>
            </>
          ) : (
            <span>Paste a screenshot (Ctrl+V) or click to upload</span>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        <div className="composer-actions">
          <span className="error-msg">{error}</span>
          <button className="btn-log" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Pinning…' : 'Pin it'}
          </button>
        </div>
      </section>

      {loading ? (
        <div className="empty-state">
          <p className="h">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p className="h">Nothing pinned up yet.</p>
          <p className="b">Add a thought, or log a trade, above.</p>
        </div>
      ) : (
        <section className="feed">
          {filtered.map((e) => {
            const mood = e.mood || 'Confident';
            const stampClass = MOOD_COLOR[mood] || 'brass';
            return (
              <article key={e.id} className={`card ${stampClass}`}>
                <div className="card-meta">
                  <span>{fmtDate(e.created_at)}</span>
                  <span className="tag">{e.type === 'thought' ? 'Thought' : 'Trade'}</span>
                  {e.type === 'trade' && <span className="tag">{e.category}</span>}
                  {e.type === 'thought' && <span className="tag">{mood}</span>}
                </div>
                {e.type === 'thought' ? (
                  <p className="thought-text">{e.text}</p>
                ) : (
                  <>
                    <p className="trade-line">{e.asset}</p>
                    {e.notes && <p className="trade-notes">{e.notes}</p>}
                  </>
                )}
                {e.image_url && <img className="card-image" src={e.image_url} alt="Attached screenshot" />}
                <div className="card-actions">
                  <button onClick={() => handleDelete(e.id)}>Unpin</button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
