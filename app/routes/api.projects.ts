import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { v4 as uuidv4 } from 'uuid';

export async function loader({ context, request }: LoaderFunctionArgs) {
  try {
    const cloudflare = context.cloudflare as { env?: { DB?: D1Database } };

    if (!cloudflare?.env?.DB) {
      return new Response(JSON.stringify({ error: 'Database not available' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user_id from query params
    const url = new URL(request.url);
    const userId = url.searchParams.get('user_id');

    if (!userId) {
      return new Response(JSON.stringify({ error: 'user_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all projects for the user
    const result = await cloudflare.env.DB
      .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all();

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
    const { name, description, user_id } = body;

    if (!name || !user_id) {
      return new Response(JSON.stringify({ error: 'Name and user_id are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user exists
    const user = await cloudflare.env.DB
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind(user_id)
      .first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const id = uuidv4();

    const result = await cloudflare.env.DB
      .prepare('INSERT INTO projects (id, name, description, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, name, description || '', user_id, now, now)
      .run();

    return new Response(JSON.stringify({ id, name, description, user_id, created_at: now, updated_at: now }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
