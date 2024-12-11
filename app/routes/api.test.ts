import { type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ context, request }: LoaderFunctionArgs) {
  try {
    return new Response(JSON.stringify({ 
      success: true,
      message: 'Test endpoint working',
      context: {
        env: context.env ? 'Has env' : 'No env',
        db: context.env?.DB ? 'Has DB' : 'No DB',
        envKeys: context.env ? Object.keys(context.env) : [],
        url: request.url,
        method: request.method,
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Failed:', error);
    return new Response(JSON.stringify({ 
      error: error.message, 
      stack: error.stack,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
