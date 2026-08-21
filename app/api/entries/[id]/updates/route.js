import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

async function ensureSchema(sql) {
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
  await sql`ALTER TABLE entries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'open';`;
  await sql`
    CREATE TABLE IF NOT EXISTS entry_updates (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      mood TEXT,
      notes TEXT,
      image_url TEXT
    );
  `;
}

export async function POST(request, context) {
  try {
    const { id } = await context.params;
    const sql = neon(process.env.DATABASE_URL);
    await ensureSchema(sql);
    const body = await request.json();
    const { mood, notes, image_url, markClosed } = body;

    if (!notes) {
      return NextResponse.json({ error: 'Notes are required' }, { status: 400 });
    }

    const updateId = randomUUID();
    await sql`
      INSERT INTO entry_updates (id, entry_id, mood, notes, image_url)
      VALUES (${updateId}, ${id}, ${mood || null}, ${notes}, ${image_url || null});
    `;

    if (markClosed) {
      await sql`UPDATE entries SET status = 'closed' WHERE id = ${id};`;
    }

    return NextResponse.json({ id: updateId });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to save update' }, { status: 500 });
  }
}
