'use client';

import { useEffect, useRef, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const MOODS = ['Confident', 'FOMO', 'Regretful'];
const MOOD_COLOR = { Confident: 'forest', FOMO: 'brass', Regretful: 'rust' };
const CATEGORIES = ['Memecoin', 'Stock', 'Leverage', 'Other'];

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

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function buildBuckets(granularity) {
  const today = new Date();
  const buckets = [];
  if (granularity === 'daily') {
    for (let i = 13; i >= 0; i--) {
      const start = startOfDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i));
      const end = new Date(start); end.setDate(end.getDate() + 1);
      buckets.push({ start, end, label: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
    }
  } else if (granularity === 'weekly') {
    const thisWeekStart = startOfWeek(today);
    for (let i = 11; i >= 0; i--) {
      const start = new Date(thisWeekStart); start.setDate(start.getDate() - i * 7);
      const end = new Date(start); end.setDate(end.getDate() + 7);
      buckets.push({ start, end, label: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) });
    }
  } else if (granularity === 'monthly') {
    for (let i = 11; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      buckets.push({ start, end, label: start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) });
    }
  } else {
    for (let i = 4; i >= 0; i--) {
      const y = today.getFullYear() - i;
      buckets.push({ start: new Date(y, 0, 1), end: new Date(y + 1, 0, 1), label: String(y) });
    }
  }
  return buckets;
}

function bucketMoodData(entries, granularity) {
  return buildBuckets(granularity).map((b) => {
    const counts = { Confident: 0, FOMO: 0, Regretful: 0 };
    entries.forEach((e) => {
      const t = new Date(e.created_at);
      if (t >= b.start && t < b.end && counts[e.mood] !== undefined) counts[e.mood]++;
    });
    return { label: b.label, ...counts };
  });
}

export default function Page() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('thought');
  const [editingId, setEditingId] = useState(null);
  const [granularity, setGranularity] = useState('daily');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const [tMood, setTMood] = useState(MOODS[0]);
  const [tText, setTText] = useState('');

  const [xAsset, setXAsset] = useState('');
  const [xCategory, setXCategory] = useState(CATEGORIES[0]);
  const [xMood, setXMood] = useState(MOODS[0]);
  const [xNotes, setXNotes] = useState('');

  const [imageState, setImageState] = useState({ url: null, blob: null });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);

  const [updateDraft, setUpdateDraft] = useState(null);
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const updateFileInputRef = useRef(null);

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
          compressImage(file)
            .then(({ blob, previewUrl }) => {
              if (updateDraft) {
                setUpdateDraft((prev) => (prev ? { ...prev, imageState: { url: previewUrl, blob } } : prev));
              } else {
                setImageState({ url: previewUrl, blob });
              }
            })
            .catch(() => {});
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [updateDraft]);

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
      const { blob, previewUrl } = await compressImage(file);
      setImageState({ url: previewUrl, blob });
    } catch (e) {
      console.error(e);
    }
    ev.target.value = '';
  }

  function resetForm() {
    setTText('');
    setXAsset('');
    setXNotes('');
    setImageState({ url: null, blob: null });
    setError('');
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setError('');
    setType(entry.type);
    if (entry.type === 'thought') {
      setTMood(entry.mood || MOODS[0]);
      setTText(entry.text || '');
    } else {
      setXAsset(entry.asset || '');
      setXCategory(entry.category || CATEGORIES[0]);
      setXMood(entry.mood || MOODS[0]);
      setXNotes(entry.notes || '');
    }
    setImageState({ url: entry.image_url || null, blob: null });
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cancelEdit() {
    setEditingId(null);
    resetForm();
  }

  async function handleSubmit() {
    setError('');
    if (type === 'thought' && !tText.trim()) { setError('Write something first.'); return; }
    if (type === 'trade' && !xAsset.trim()) { setError('Name the asset first.'); return; }

    setSubmitting(true);
    try {
      let image_url = imageState.url && !imageState.blob ? imageState.url : null;
      if (imageState.blob) {
        const form = new FormData();
        form.append('file', imageState.blob, 'screenshot.jpg');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
        if (!uploadRes.ok) throw new Error('Image upload failed');
        const uploadData = await uploadRes.json();
        image_url = uploadData.url;
      }

      const body = type === 'thought'
        ? { type: 'thought', mood: tMood, text: tText.trim(), image_url }
        : { type: 'trade', asset: xAsset.trim(), category: xCategory, mood: xMood, notes: xNotes.trim(), image_url };

      const url = editingId ? `/api/entries/${editingId}` : '/api/entries';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');

      setEditingId(null);
      resetForm();
      await load();
    } catch (e) {
      console.error(e);
      setError('Something went wrong saving that entry.');
    }
    setSubmitting(false);
  }

  async function confirmDelete() {
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) cancelEdit();
    try {
      await fetch(`/api/entries/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error(e);
      load();
    }
  }

  function openUpdateForm(entryId) {
    if (updateDraft && updateDraft.entryId === entryId) {
      setUpdateDraft(null);
      return;
    }
    setUpdateDraft({ entryId, mood: MOODS[0], notes: '', imageState: { url: null, blob: null }, markClosed: false });
    setUpdateError('');
  }

  async function handleUpdateFileChange(ev) {
    const file = ev.target.files[0];
    if (!file || !updateDraft) return;
    try {
      const { blob, previewUrl } = await compressImage(file);
      setUpdateDraft((prev) => (prev ? { ...prev, imageState: { url: previewUrl, blob } } : prev));
    } catch (e) {
      console.error(e);
    }
    ev.target.value = '';
  }

  async function submitUpdate() {
    if (!updateDraft) return;
    if (!updateDraft.notes.trim()) { setUpdateError('Add a quick note first.'); return; }
    setUpdateSubmitting(true);
    setUpdateError('');
    try {
      let image_url = updateDraft.imageState.url && !updateDraft.imageState.blob ? updateDraft.imageState.url : null;
      if (updateDraft.imageState.blob) {
        const form = new FormData();
        form.append('file', updateDraft.imageState.blob, 'screenshot.jpg');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
        if (!uploadRes.ok) throw new Error('Image upload failed');
        const uploadData = await uploadRes.json();
        image_url = uploadData.url;
      }
      const res = await fetch(`/api/entries/${updateDraft.entryId}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mood: updateDraft.mood, notes: updateDraft.notes.trim(), image_url, markClosed: updateDraft.markClosed }),
      });
      if (!res.ok) throw new Error('Save failed');
      setUpdateDraft(null);
      await load();
    } catch (e) {
      console.error(e);
      setUpdateError('Something went wrong saving that update.');
    }
    setUpdateSubmitting(false);
  }

  async function reopenTrade(id) {
    try {
      await fetch(`/api/entries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statusOnly: true, status: 'open' }),
      });
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  const filtered = entries
    .filter((e) => filter === 'all' || e.type === filter)
    .filter((e) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        (e.text && e.text.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        (e.asset && e.asset.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const chartData = bucketMoodData(entries, granularity);

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

      <section className="composer" ref={composerRef}>
        {editingId && (
          <div className="editing-banner">
            <span>Editing entry</span>
            <button onClick={cancelEdit}>Cancel</button>
          </div>
        )}

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
          className={`paste-zone ${imageState.url ? 'has-image' : ''}`}
          onClick={() => { if (!imageState.url) fileInputRef.current?.click(); }}
        >
          {imageState.url ? (
            <>
              <img src={imageState.url} alt="Attached screenshot" />
              <button
                type="button"
                className="paste-remove"
                aria-label="Remove image"
                onClick={(ev) => { ev.stopPropagation(); setImageState({ url: null, blob: null }); }}
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
            {submitting ? (editingId ? 'Saving…' : 'Pinning…') : (editingId ? 'Save changes' : 'Pin it')}
          </button>
        </div>
      </section>

      {entries.length > 0 && (
        <section className="trends">
          <p className="trends-title">Mood trends</p>
          <div className="type-toggle" style={{ marginBottom: '14px' }}>
            {['daily', 'weekly', 'monthly', 'yearly'].map((g) => (
              <button key={g} className={granularity === g ? 'active' : ''} onClick={() => setGranularity(g)}>
                {g[0].toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(43,32,19,0.12)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fill: '#7A6B4C' }}
                  axisLine={{ stroke: 'rgba(43,32,19,0.2)' }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10, fill: '#7A6B4C' }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip
                  contentStyle={{ background: '#F2E9D3', border: '1px solid rgba(43,32,19,0.2)', borderRadius: 8, fontFamily: 'Nunito, sans-serif', fontSize: 12 }}
                  labelStyle={{ color: '#2B2013', fontWeight: 600 }}
                  cursor={{ fill: 'rgba(43,32,19,0.05)' }}
                />
                <Legend wrapperStyle={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11 }} />
                <Bar dataKey="Confident" stackId="mood" fill="#3F7A6E" />
                <Bar dataKey="FOMO" stackId="mood" fill="#B4862B" />
                <Bar dataKey="Regretful" stackId="mood" fill="#B33A3A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      <div className="search-bar">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search your entries…"
        />
      </div>

      {loading ? (
        <div className="empty-state">
          <p className="h">Loading…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p className="h">{entries.length === 0 ? 'Nothing pinned up yet.' : 'No entries match.'}</p>
          <p className="b">{entries.length === 0 ? 'Add a thought, or log a trade, above.' : 'Try a different search or filter.'}</p>
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
                  {e.type === 'trade' && (
                    <span className={`tag status-${e.status || 'open'}`}>{e.status === 'closed' ? 'Closed' : 'Open'}</span>
                  )}
                  <span className="tag">{mood}</span>
                </div>
                {e.type === 'thought' ? (
                  <p className="entry-text">{e.text}</p>
                ) : (
                  <p className="entry-text">
                    <span className="asset-inline">{e.asset}</span>
                    {e.notes ? `— ${e.notes}` : ''}
                  </p>
                )}
                {e.image_url && <img className="card-image" src={e.image_url} alt="Attached screenshot" />}

                {e.type === 'trade' && Array.isArray(e.updates) && e.updates.length > 0 && (
                  <div className="updates-thread">
                    {e.updates.map((u) => (
                      <div className="update-item" key={u.id}>
                        <span className={`update-dot ${MOOD_COLOR[u.mood] || 'brass'}`} />
                        <div className="update-body">
                          <div className="update-meta">{fmtDate(u.created_at)} · {u.mood}</div>
                          <p className="update-text">{u.notes}</p>
                          {u.image_url && <img className="update-image" src={u.image_url} alt="Update screenshot" />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="card-actions">
                  <button onClick={() => startEdit(e)}>Edit</button>
                  {e.type === 'trade' && (
                    <button onClick={() => openUpdateForm(e.id)}>
                      {updateDraft?.entryId === e.id ? 'Cancel update' : '+ Add update'}
                    </button>
                  )}
                  {e.type === 'trade' && e.status === 'closed' && (
                    <button onClick={() => reopenTrade(e.id)}>Reopen</button>
                  )}
                  <button onClick={() => setConfirmDeleteId(e.id)}>Unpin</button>
                </div>

                {updateDraft?.entryId === e.id && (
                  <div className="update-form">
                    <div className="field-row">
                      <div className="field">
                        <label>Mood</label>
                        <select
                          value={updateDraft.mood}
                          onChange={(ev) => setUpdateDraft((prev) => ({ ...prev, mood: ev.target.value }))}
                        >
                          {MOODS.map((m) => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="field-row">
                      <div className="field full">
                        <label>What&apos;s new</label>
                        <textarea
                          value={updateDraft.notes}
                          onChange={(ev) => setUpdateDraft((prev) => ({ ...prev, notes: ev.target.value }))}
                          placeholder="Price check, a thought, whatever's changed."
                        />
                      </div>
                    </div>
                    <div
                      className={`paste-zone ${updateDraft.imageState.url ? 'has-image' : ''}`}
                      onClick={() => { if (!updateDraft.imageState.url) updateFileInputRef.current?.click(); }}
                    >
                      {updateDraft.imageState.url ? (
                        <>
                          <img src={updateDraft.imageState.url} alt="Attached screenshot" />
                          <button
                            type="button"
                            className="paste-remove"
                            aria-label="Remove image"
                            onClick={(ev) => { ev.stopPropagation(); setUpdateDraft((prev) => ({ ...prev, imageState: { url: null, blob: null } })); }}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <span>Paste a screenshot (Ctrl+V) or click to upload</span>
                      )}
                    </div>
                    <input ref={updateFileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUpdateFileChange} />
                    <label className="close-checkbox">
                      <input
                        type="checkbox"
                        checked={updateDraft.markClosed}
                        onChange={(ev) => setUpdateDraft((prev) => ({ ...prev, markClosed: ev.target.checked }))}
                      />
                      Mark this trade as closed
                    </label>
                    <div className="composer-actions">
                      <span className="error-msg">{updateError}</span>
                      <button className="btn-log" onClick={submitUpdate} disabled={updateSubmitting}>
                        {updateSubmitting ? 'Saving…' : 'Add update'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {confirmDeleteId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
          <div className="modal-box" onClick={(ev) => ev.stopPropagation()}>
            <p className="modal-title">Delete this entry?</p>
            <p className="modal-body">This can&apos;t be undone.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button className="modal-confirm" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
