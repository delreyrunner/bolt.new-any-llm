import { json, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';
import { useUserId } from '~/hooks/useUserId';
import { Workbench } from '~/components/workbench/Workbench.client';

export const meta: MetaFunction = () => {
  return [{ title: 'Bolt' }, { name: 'description', content: 'Talk with Bolt, an AI assistant from StackBlitz' }];
};

function parseJwt(token: string) {
  try {
    const [_header, payload, _signature] = token.split('.');
    const decodedPayload = JSON.parse(atob(payload));
    return decodedPayload;
  } catch (e) {
    console.error('Error parsing JWT:', e);
    return null;
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  console.log('Root loader called');
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  console.log('Token from URL:', token);

  if (token) {
    const payload = parseJwt(token);
    console.log('JWT payload:', payload);
    
    if (payload?.userId) {
      const db = context.env.DB;
      console.log('Creating user:', payload.userId);
      
      try {
        const result = await db.prepare(
          'INSERT OR IGNORE INTO users (id) VALUES (?)'
        ).bind(payload.userId).run();
        console.log('DB result:', result);
      } catch (error) {
        console.error('Failed to create user:', error);
      }
    }
  }

  return json({});
}

export default function Index() {
  const userId = useUserId();

  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <div className="flex flex-1">
        <ClientOnly fallback={<BaseChat />}>{() => <Chat userId={userId} />}</ClientOnly>
        <ClientOnly>{() => <Workbench userId={userId} />}</ClientOnly>
      </div>
    </div>
  );
}
