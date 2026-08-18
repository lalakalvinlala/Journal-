import { neon } from '@neondatabase/serverless';
import { NextResponse } from 'next/server';

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
