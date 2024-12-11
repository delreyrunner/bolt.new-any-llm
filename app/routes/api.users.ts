import { type ActionFunctionArgs } from '@remix-run/cloudflare';

export async function action({ context, request }: ActionFunctionArgs) {
  console.log('User API called');
  const db = context.env.DB;
  
  if (request.method !== 'POST') {
    console.error('Invalid method:', request.method);
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { userId } = await request.json();
    console.log('Creating user:', userId);

    const result = await db.prepare(
      'INSERT OR IGNORE INTO users (id) VALUES (?)'
    ).bind(userId).run();

    console.log('DB result:', result);
    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Failed to create user:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
