import { type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ context, request }: LoaderFunctionArgs) {
  try {
    const cloudflare = context.cloudflare as { env?: { DB?: D1Database } };
    
    if (!cloudflare || !cloudflare.env) {
      return new Response(JSON.stringify({ 
        error: 'No cloudflare.env',
        context: {
          hasContext: !!context,
          contextKeys: Object.keys(context || {}),
          hasCloudflare: !!cloudflare,
          cloudflareKeys: cloudflare ? Object.keys(cloudflare) : [],
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!cloudflare.env.DB) {
      return new Response(JSON.stringify({ 
        error: 'No cloudflare.env.DB', 
        env: {
          hasEnv: !!cloudflare.env,
          envKeys: Object.keys(cloudflare.env),
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const result = await cloudflare.env.DB.prepare('SELECT * FROM users').all();
    
    return new Response(JSON.stringify({ 
      success: true, 
      result,
      context: {
        env: cloudflare.env ? 'Has env' : 'No env',
        db: cloudflare.env.DB ? 'Has DB' : 'No DB',
        envKeys: cloudflare.env ? Object.keys(cloudflare.env) : [],
        url: request.url,
        method: request.method,
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
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
