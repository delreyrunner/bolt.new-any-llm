import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
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

    // Get project_id from query params
    const url = new URL(request.url);
    const projectId = url.searchParams.get('project_id');

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'project_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all chat history for the project
    const result = await cloudflare.env.DB
      .prepare('SELECT * FROM chat_history WHERE project_id = ? ORDER BY created_at DESC')
      .bind(projectId)
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
  if (request.method === 'POST') {
    try {
      const cloudflare = context.cloudflare as { env?: { DB?: D1Database } };

      if (!cloudflare?.env?.DB) {
        return new Response(JSON.stringify({ error: 'Database not available' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const body = await request.json();
      const { project_id, user_id, messages } = body;

      if (!project_id || !user_id || !messages) {
        return new Response(JSON.stringify({ error: 'project_id, user_id, and messages are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if project exists
      const project = await cloudflare.env.DB
        .prepare('SELECT id FROM projects WHERE id = ?')
        .bind(project_id)
        .first();

      if (!project) {
        return new Response(JSON.stringify({ error: 'Project not found' }), {
          status: 404,
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

      // Store messages as JSON string
      const messagesJson = JSON.stringify(messages);

      const result = await cloudflare.env.DB
        .prepare('INSERT INTO chat_history (id, project_id, user_id, messages, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(id, project_id, user_id, messagesJson, now, now)
        .run();

      return new Response(JSON.stringify({ id, project_id, user_id, messages, created_at: now, updated_at: now }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } else {
    return chatAction({ context, request });
  }
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

async function chatAction({ context, request }: ActionFunctionArgs) {
  const db = context.env.DB;
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const userId = cookies.bolt_user_id;

  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { messages, projectId } = await request.json();

  // Ensure project exists and belongs to user
  const project = await db.prepare(
    'SELECT * FROM projects WHERE id = ? AND user_id = ?'
  ).bind(projectId, userId).first();

  if (!project) {
    return new Response('Project not found or unauthorized', { status: 404 });
  }

  // Create chat message
  const messageId = uuidv4();
  await db.prepare(
    'INSERT INTO chat_messages (id, project_id, user_id, content) VALUES (?, ?, ?, ?)'
  ).bind(messageId, projectId, userId, JSON.stringify(messages)).run();

  const streamingOptions: StreamingOptions = {
    toolChoice: 'none',
    onFinish: async ({ text: content, finishReason }) => {
      if (finishReason !== 'length') {
        return stream.close();
      }

      if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
        throw Error('Cannot continue message: Maximum segments reached');
      }

      const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

      console.log(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

      messages.push({ role: 'assistant', content });
      messages.push({ role: 'user', content: CONTINUE_PROMPT });

      const result = await streamText(messages, context.cloudflare.env, streamingOptions, {});

      return stream.switchSource(result.toAIStream());
    },
    maxResponseSegments: MAX_RESPONSE_SEGMENTS,
    maxTokens: MAX_TOKENS,
    continuePrompt: CONTINUE_PROMPT,
  };

  const stream = new SwitchableStream();

  try {
    const result = await streamText(messages, context.cloudflare.env, streamingOptions, {});

    stream.switchSource(result.toAIStream());

    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.log(error);

    if (error.message?.includes('API key')) {
      throw new Response('Invalid or missing API key', {
        status: 401,
        statusText: 'Unauthorized',
      });
    }

    throw new Response(null, {
      status: 500,
      statusText: 'Internal Server Error',
    });
  }
}
