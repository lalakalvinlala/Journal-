import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

function getSql() {
  return neon(process.env.DATABASE_URL);
}

async function ensureTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS entries (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      mood TEXT,
      text TEXT,
      asset TEXT,
      category TEXT,
      notes TEXT,
      image_url TEXT
    );
  `;
}

export async function GET() {
  try {
    const sql = getSql();
    await ensureTable(sql);
    const rows = await sql`SELECT * FROM entries ORDER BY created_at DESC;`;
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to load entries' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const sql = getSql();
    await ensureTable(sql);
