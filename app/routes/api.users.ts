import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { v4 as uuidv4 } from 'uuid';

export async function loader({ context }: LoaderFunctionArgs) {
  try {
    const cloudflare = context.cloudflare as { env?: { DB?: D1Database } };

    if (!cloudflare?.env?.DB) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await cloudflare.env.DB.prepare('SELECT * FROM users').all();

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function action({ context, request }: ActionFunctionArgs) {
  try {
    const cloudflare = context.cloudflare as { env?: { DB?: D1Database } };

    if (!cloudflare?.env?.DB) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { email, name } = body;

    if (!email || !name) {
      return new Response(JSON.stringify({ error: 'Email and name are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const id = uuidv4();

    const result = await cloudflare.env.DB
      .prepare('INSERT INTO users (id, email, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, email, name, now, now)
      .run();

    return new Response(JSON.stringify({ id, email, name, created_at: now, updated_at: now }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
