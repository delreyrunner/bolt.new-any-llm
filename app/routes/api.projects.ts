import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { v4 as uuidv4 } from 'uuid';

export async function action({ context, request }: ActionFunctionArgs) {
  const db = context.env.DB;
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const userId = cookies.bolt_user_id;

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (request.method === 'POST') {
    const { name } = await request.json();
    const projectId = uuidv4();

    await db.prepare(
      'INSERT INTO projects (id, user_id, name) VALUES (?, ?, ?)'
    ).bind(projectId, userId, name).run();

    return new Response(JSON.stringify({ id: projectId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'GET') {
    const projects = await db.prepare(
      'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(userId).all();

    return new Response(JSON.stringify(projects), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response('Method not allowed', { status: 405 });
}

function parseCookies(cookieHeader: string) {
  const cookies: any = {};
  const items = cookieHeader.split(';').map((cookie) => cookie.trim());
  items.forEach((item) => {
    const [name, ...rest] = item.split('=');
    if (name && rest) {
      cookies[name] = rest.join('=');
    }
  });
  return cookies;
}
