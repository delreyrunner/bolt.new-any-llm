import type { Message } from 'ai';
import { createScopedLogger } from '~/utils/logger';
import type { ChatHistoryItem } from './useChatHistory';

const logger = createScopedLogger('ChatHistory');

// this is used at the top level and never rejects
export async function openDatabase(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') {
    console.error('indexedDB is not available in this environment.');
    return undefined;
  }

  return new Promise((resolve) => {
    const request = indexedDB.open('boltHistory', 2);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('users')) {
        const store = db.createObjectStore('users', { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
      }

      if (!db.objectStoreNames.contains('chats')) {
        const store = db.createObjectStore('chats', { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
        store.createIndex('urlId', 'urlId', { unique: true });
        store.createIndex('userId', 'userId', { unique: false });
      }

      if (!db.objectStoreNames.contains('userProjects')) {
        const store = db.createObjectStore('userProjects', { keyPath: 'id' });
        store.createIndex('id', 'id', { unique: true });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('projectId', 'projectId', { unique: true });
      }
    };

    request.onsuccess = (event: Event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event: Event) => {
      resolve(undefined);
      logger.error((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function getAll(db: IDBDatabase): Promise<ChatHistoryItem[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result as ChatHistoryItem[]);
    request.onerror = () => reject(request.error);
  });
}

export async function setMessages(
  db: IDBDatabase,
  id: string,
  messages: Message[],
  userId: string | null,
  urlId?: string,
  description?: string,
  timestamp?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');

    if (timestamp && isNaN(Date.parse(timestamp))) {
      reject(new Error('Invalid timestamp'));
      return;
    }

    const request = store.put({
      id,
      messages,
      urlId,
      userId,
      description,
      timestamp: timestamp ?? new Date().toISOString(),
    });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMessages(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  const chat = await getMessagesById(db, id) || await getMessagesByUrlId(db, id);
  if (!chat) return null;

  // Only return the chat if it has no userId (legacy) or if it matches the current user
  const currentUserId = workbenchStore.getCurrentUserId();
  if (!chat.userId || chat.userId === currentUserId) {
    return chat;
  }
  return null;
}

export async function getMessagesByUrlId(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const index = store.index('urlId');
    const request = index.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function getMessagesById(db: IDBDatabase, id: string): Promise<ChatHistoryItem> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result as ChatHistoryItem);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readwrite');
    const store = transaction.objectStore('chats');
    const request = store.delete(id);

    request.onsuccess = () => resolve(undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function getNextId(db: IDBDatabase): Promise<string> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const request = store.getAllKeys();

    request.onsuccess = () => {
      const highestId = request.result.reduce((cur, acc) => Math.max(+cur, +acc), 0);
      resolve(String(+highestId + 1));
    };

    request.onerror = () => reject(request.error);
  });
}

export async function getUrlId(db: IDBDatabase, id: string): Promise<string> {
  const idList = await getUrlIds(db);

  if (!idList.includes(id)) {
    return id;
  } else {
    let i = 2;

    while (idList.includes(`${id}-${i}`)) {
      i++;
    }

    return `${id}-${i}`;
  }
}

async function getUrlIds(db: IDBDatabase): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('chats', 'readonly');
    const store = transaction.objectStore('chats');
    const idList: string[] = [];

    const request = store.openCursor();

    request.onsuccess = (event: Event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (cursor) {
        idList.push(cursor.value.urlId);
        cursor.continue();
      } else {
        resolve(idList);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function forkChat(db: IDBDatabase, chatId: string, messageId: string): Promise<string> {
  const chat = await getMessages(db, chatId);

  if (!chat) {
    throw new Error('Chat not found');
  }

  // Find the index of the message to fork at
  const messageIndex = chat.messages.findIndex((msg) => msg.id === messageId);

  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  // Get messages up to and including the selected message
  const messages = chat.messages.slice(0, messageIndex + 1);

  return createChatFromMessages(db, chat.description ? `${chat.description} (fork)` : 'Forked chat', messages);
}

export async function duplicateChat(db: IDBDatabase, id: string): Promise<string> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  return createChatFromMessages(db, `${chat.description || 'Chat'} (copy)`, chat.messages);
}

export async function createChatFromMessages(
  db: IDBDatabase,
  description: string,
  messages: Message[],
): Promise<string> {
  const newId = await getNextId(db);
  const newUrlId = await getUrlId(db, newId); // Get a new urlId for the duplicated chat

  await setMessages(
    db,
    newId,
    messages,
    null, // Use null as the userId for now
    newUrlId, // Use the new urlId
    description,
  );

  return newUrlId; // Return the urlId instead of id for navigation
}

export async function updateChatDescription(db: IDBDatabase, id: string, description: string): Promise<void> {
  const chat = await getMessages(db, id);

  if (!chat) {
    throw new Error('Chat not found');
  }

  if (!description.trim()) {
    throw new Error('Description cannot be empty');
  }

  await setMessages(db, id, chat.messages, chat.userId, chat.urlId, description, chat.timestamp);
}

export interface User {
  id: string;
  createdAt: number;
  updatedAt: number;
}

export async function createUser(db: IDBDatabase, userId: string): Promise<User> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readwrite');
    const store = transaction.objectStore('users');

    const now = Date.now();
    const user: User = {
      id: userId,
      createdAt: now,
      updatedAt: now,
    };

    transaction.oncomplete = () => {
      logger.info(`Successfully created user ${userId}`);
      resolve(user);
    };

    transaction.onerror = () => {
      logger.error(`Failed to create user ${userId}: ${transaction.error}`);
      reject(transaction.error);
    };

    store.put(user);
  });
}

export async function getUser(db: IDBDatabase, userId: string): Promise<User | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('users', 'readonly');
    const store = transaction.objectStore('users');
    const request = store.get(userId);

    request.onsuccess = () => resolve(request.result as User || null);
    request.onerror = () => reject(request.error);
  });
}

export async function ensureUser(db: IDBDatabase, userId: string): Promise<User> {
  try {
    logger.info(`Ensuring user exists: ${userId}`);
    const existingUser = await getUser(db, userId);
    if (existingUser) {
      logger.info(`User ${userId} already exists`);
      return existingUser;
    }
    logger.info(`Creating new user: ${userId}`);
    return await createUser(db, userId);
  } catch (error) {
    logger.error(`Failed to ensure user ${userId}: ${error}`);
    throw error;
  }
}

export interface UserProject {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export async function createUserProject(
  db: IDBDatabase,
  userId: string,
  projectId: string,
  name: string,
): Promise<UserProject> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('userProjects', 'readwrite');
    const store = transaction.objectStore('userProjects');
    
    const project: UserProject = {
      id: `${userId}_${projectId}`,
      userId,
      projectId,
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const request = store.add(project);
    request.onsuccess = () => resolve(project);
    request.onerror = () => reject(request.error);
  });
}

export async function getUserProjects(
  db: IDBDatabase,
  userId: string,
): Promise<UserProject[]> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('userProjects', 'readonly');
    const store = transaction.objectStore('userProjects');
    const index = store.index('userId');
    const request = index.getAll(userId);

    request.onsuccess = () => resolve(request.result as UserProject[]);
    request.onerror = () => reject(request.error);
  });
}

export async function updateUserProject(
  db: IDBDatabase,
  project: UserProject,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('userProjects', 'readwrite');
    const store = transaction.objectStore('userProjects');
    
    project.updatedAt = Date.now();
    const request = store.put(project);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteUserProject(
  db: IDBDatabase,
  userId: string,
  projectId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('userProjects', 'readwrite');
    const store = transaction.objectStore('userProjects');
    const request = store.delete(`${userId}_${projectId}`);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
