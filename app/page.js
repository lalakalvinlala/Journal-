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
