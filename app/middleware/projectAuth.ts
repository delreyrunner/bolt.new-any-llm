import { openDatabase } from '~/lib/persistence/db';
import { verifyToken } from '~/utils/auth';

export async function verifyProjectAccess(token: string | null, projectId: string | null): Promise<boolean> {
  if (!token || !projectId) return false;

  try {
    const payload = await verifyToken(token);
    if (!payload?.userId) return false;

    const db = await openDatabase();
    if (!db) return false;

    // Get user's projects from IndexedDB
    const transaction = db.transaction('userProjects', 'readonly');
    const store = transaction.objectStore('userProjects');
    const index = store.index('userId');
    const request = index.getAll(payload.userId);

    return new Promise((resolve) => {
      request.onsuccess = () => {
        const projects = request.result;
        resolve(projects.some(p => p.projectId === projectId));
      };
      request.onerror = () => resolve(false);
    });
  } catch (error) {
    console.error('Error verifying project access:', error);
    return false;
  }
}

export function withProjectAuth(handler: Function) {
  return async (req: Request) => {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    const projectId = url.searchParams.get('projectId');

    if (!await verifyProjectAccess(token, projectId)) {
      return new Response('Unauthorized', { status: 401 });
    }

    return handler(req);
  };
}
