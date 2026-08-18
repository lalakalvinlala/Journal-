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
    const body = await request.json();
    const { type, mood, text, asset, category, notes, image_url } = body;

    if (type !== 'thought' && type !== 'trade') {
      return NextResponse.json({ error: 'Invalid entry type' }, { status: 400 });
    }
    if (type === 'thought' && !text) {
      return NextResponse.json({ error: 'Thought text is required' }, { status: 400 });
    }
    if (type === 'trade' && !asset) {
      return NextResponse.json({ error: 'Asset is required' }, { status: 400 });
    }

    const id = randomUUID();
    await sql`
      INSERT INTO entries (id, type, mood, text, asset, category, notes, image_url)
      VALUES (${id}, ${type}, ${mood || null}, ${text || null}, ${asset || null}, ${category || null}, ${notes || null}, ${image_url || null});
    `;
    return NextResponse.json({ id });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 });
  }
}
