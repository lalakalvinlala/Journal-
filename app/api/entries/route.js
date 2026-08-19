import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

export async function PATCH(request, context) {
  try {
    const { id } = await context.params;
    const sql = neon(process.env.DATABASE_URL);
    const body = await request.json();
    const { mood, text, asset, category, notes, image_url } = body;
    await sql`
      UPDATE entries
      SET mood = ${mood || null},
          text = ${text || null},
          asset = ${asset || null},
          category = ${category || null},
          notes = ${notes || null},
          image_url = ${image_url || null}
      WHERE id = ${id};
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  try {
    const { id } = await context.params;
    const sql = neon(process.env.DATABASE_URL);
    await sql`DELETE FROM entries WHERE id = ${id};`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
  }
}
