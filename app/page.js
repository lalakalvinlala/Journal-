'use client';

import { useEffect, useRef, useState } from 'react';

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
      const maxW = 1800;
      if (w > maxW) { h = Math.round((h * maxW) / w); w = maxW; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Could not process image')); return; }
          resolve({ blob, previewUrl: canvas.toDataURL('image/png') });
        },
        'image/png'
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
  const [search, setSearch] = useState('');
  const [type, setType] = useState('thought');
  const [editingId, setEditingId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteUpdateId, setConfirmDeleteUpdateId] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);
  const [zoomed, setZoomed] = useState(false);

  const [tText, setTText] = useState('');

  const [xAsset, setXAsset] = useState('');
  const [xCategory, setXCategory] = useState(CATEGORIES[0]);
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

  useEffect(() => {
    setZoomed(false);
  }, [lightboxImage]);

  useEffect(() => {
    if (!lightboxImage) return;
    function onKey(ev) {
      if (ev.key === 'Escape') setLightboxImage(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightboxImage]);

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
      setTText(entry.text || '');
    } else {
      setXAsset(entry.asset || '');
      setXCategory(entry.category || CATEGORIES[0]);
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
        form.append('file', imageState.blob, 'screenshot.png');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
        if (!uploadRes.ok) throw new Error('Image upload failed');
        const uploadData = await uploadRes.json();
        image_url = uploadData.url;
      }

      const body = type === 'thought'
        ? { type: 'thought', text: tText.trim(), image_url }
        : { type: 'trade', asset: xAsset.trim(), category: xCategory, notes: xNotes.trim(), image_url };

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
    if (updateDraft && updateDraft.entryId === entryId && !updateDraft.updateId) {
      setUpdateDraft(null);
      return;
    }
    setUpdateDraft({ entryId, updateId: null, notes: '', imageState: { url: null, blob: null }, markClosed: false });
    setUpdateError('');
  }

  function startEditUpdate(entryId, update) {
    setUpdateDraft({
      entryId,
      updateId: update.id,
      notes: update.notes || '',
      imageState: { url: update.image_url || null, blob: null },
      markClosed: false,
    });
    setUpdateError('');
  }

  function cancelUpdateForm() {
    setUpdateDraft(null);
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
        form.append('file', updateDraft.imageState.blob, 'screenshot.png');
        const uploadRes = await fetch('/api/upload', { method: 'POST', body: form });
        if (!uploadRes.ok) throw new Error('Image upload failed');
        const uploadData = await uploadRes.json();
        image_url = uploadData.url;
      }
      if (updateDraft.updateId) {
        const res = await fetch(`/api/updates/${updateDraft.updateId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: updateDraft.notes.trim(), image_url }),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        const res = await fetch(`/api/entries/${updateDraft.entryId}/updates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: updateDraft.notes.trim(), image_url, markClosed: updateDraft.markClosed }),
        });
        if (!res.ok) throw new Error('Save failed');
      }
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

  async function togglePin(entry) {
    const nextPinned = !entry.pinned;
    setEntries((prev) => prev.map((x) => (x.id === entry.id ? { ...x, pinned: nextPinned } : x)));
    try {
      await fetch(`/api/entries/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinOnly: true, pinned: nextPinned }),
      });
    } catch (e) {
      console.error(e);
      load();
    }
  }

  async function confirmDeleteUpdate() {
    const id = confirmDeleteUpdateId;
    setConfirmDeleteUpdateId(null);
    if (updateDraft && updateDraft.updateId === id) setUpdateDraft(null);
    try {
      await fetch(`/api/updates/${id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      console.error(e);
    }
  }

  function renderEntry(e) {
    return (
      <article key={e.id} className={`card ${e.type === 'trade' ? 'trade' : 'thought'}`}>
        <div className="card-meta">
          <span>{fmtDate(e.created_at)}</span>
          <span className="tag">{e.type === 'thought' ? 'Thought' : 'Trade'}</span>
          {e.type === 'trade' && <span className="tag">{e.category}</span>}
          {e.type === 'trade' && (
            <span className={`tag status-${e.status || 'open'}`}>{e.status === 'closed' ? 'Closed' : 'Open'}</span>
          )}
          {e.pinned && <span className="tag pinned-tag">★ Pinned</span>}
        </div>
        {e.type === 'thought' ? (
          <p className="entry-text">{e.text}</p>
        ) : (
          <p className="entry-text">
            <span className="asset-inline">{e.asset}</span>
            {e.notes ? `— ${e.notes}` : ''}
          </p>
        )}
        {e.image_url && (
          <img
            className="card-image"
            src={e.image_url}
            alt="Attached screenshot"
            onClick={() => setLightboxImage(e.image_url)}
          />
        )}

        {e.type === 'trade' && Array.isArray(e.updates) && e.updates.length > 0 && (
          <div className="updates-thread">
            {e.updates.map((u) => (
              <div className="update-item" key={u.id}>
                <span className="update-dot" />
                <div className="update-body">
                  <div className="update-meta">{fmtDate(u.created_at)}</div>
                  <p className="update-text">{u.notes}</p>
                  {u.image_url && (
                    <img
                      className="update-image"
                      src={u.image_url}
                      alt="Update screenshot"
                      onClick={() => setLightboxImage(u.image_url)}
                    />
                  )}
                  <div className="card-actions update-item-actions">
                    <button onClick={() => startEditUpdate(e.id, u)}>Edit</button>
                    <button onClick={() => setConfirmDeleteUpdateId(u.id)}>Delete</button>
                  </div>
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
          <button onClick={() => togglePin(e)}>{e.pinned ? 'Unpin' : 'Pin to top'}</button>
          <button onClick={() => setConfirmDeleteId(e.id)}>Remove</button>
        </div>

        {updateDraft?.entryId === e.id && (
          <div className="update-form">
            <div className="editing-banner">
              <span>{updateDraft.updateId ? 'Editing update' : 'New update'}</span>
              <button onClick={cancelUpdateForm}>Cancel</button>
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
            {!updateDraft.updateId && (
              <label className="close-checkbox">
                <input
                  type="checkbox"
                  checked={updateDraft.markClosed}
                  onChange={(ev) => setUpdateDraft((prev) => ({ ...prev, markClosed: ev.target.checked }))}
                />
                Mark this trade as closed
              </label>
            )}
            <div className="composer-actions">
              <span className="error-msg">{updateError}</span>
              <button className="btn-log" onClick={submitUpdate} disabled={updateSubmitting}>
                {updateSubmitting ? 'Saving…' : (updateDraft.updateId ? 'Save changes' : 'Add update')}
              </button>
            </div>
          </div>
        )}
      </article>
    );
  }

  const filtered = entries
    .filter((e) => {
      if (filter === 'all') return true;
      if (filter === 'thought') return e.type === 'thought';
      if (filter === 'trade') return e.type === 'trade';
      if (filter === 'trade-open') return e.type === 'trade' && (e.status || 'open') === 'open';
      if (filter === 'trade-closed') return e.type === 'trade' && e.status === 'closed';
      return true;
    })
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

  const pinnedEntries = entries
    .filter((e) => e.pinned)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <div className="wrap">
      <header>
        <p className="eyebrow">Thoughts and positions, pinned up</p>
        <h1>The Pinboard</h1>
      </header>

      <nav className="tabs">
        {[
          ['all', 'Everything'],
          ['thought', 'Thoughts'],
          ['trade-open', 'Open Trades'],
          ['trade-closed', 'Closed Trades'],
        ].map(([key, label]) => (
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

      {pinnedEntries.length > 0 && (
        <section className="pinned-section">
          <p className="pinned-heading">★ Pinned</p>
          <div className="feed">
            {pinnedEntries.map((e) => renderEntry(e))}
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
          {filtered.map((e) => renderEntry(e))}
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
      {confirmDeleteUpdateId && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteUpdateId(null)}>
          <div className="modal-box" onClick={(ev) => ev.stopPropagation()}>
            <p className="modal-title">Delete this update?</p>
            <p className="modal-body">This can&apos;t be undone.</p>
            <div className="modal-actions">
              <button className="modal-cancel" onClick={() => setConfirmDeleteUpdateId(null)}>Cancel</button>
              <button className="modal-confirm" onClick={confirmDeleteUpdate}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <button className="lightbox-close" onClick={(ev) => { ev.stopPropagation(); setLightboxImage(null); }} aria-label="Close">×</button>
          <div className="lightbox-inner" onClick={(ev) => ev.stopPropagation()}>
            <img
              src={lightboxImage}
              alt="Enlarged screenshot"
              className={zoomed ? 'zoomed' : ''}
              onClick={() => setZoomed((z) => !z)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
