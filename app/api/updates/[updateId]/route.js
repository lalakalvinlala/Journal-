import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

export async function PATCH(request, context) {
  try {
    const { updateId } = await context.params;
    const sql = neon(process.env.DATABASE_URL);
    const body = await request.json();
    const { mood, notes, image_url } = body;
    await sql`
      UPDATE entry_updates
      SET mood = ${mood || null},
          notes = ${notes || null},
          image_url = ${image_url || null}
      WHERE id = ${updateId};
    `;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  try {
    const { updateId } = await context.params;
    const sql = neon(process.env.DATABASE_URL);
    await sql`DELETE FROM entry_updates WHERE id = ${updateId};`;
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to delete update' }, { status: 500 });
  }
}
