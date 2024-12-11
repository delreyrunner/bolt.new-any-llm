import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { v4 as uuidv4 } from 'uuid';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
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
