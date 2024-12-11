import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';

const USER_ID_COOKIE = 'bolt_user_id';

function getTokenFromUrl() {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('token');
}

function parseJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
      '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
    ).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('Error parsing JWT:', e);
    return null;
  }
}

export function useUserId() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const initUser = async () => {
      console.log('Initializing user...');
      // Try to get user ID from JWT token in URL
      const token = getTokenFromUrl();
      console.log('Got token from URL:', token);
      
      let id = null;
      
      if (token) {
        const payload = parseJwt(token);
        console.log('Parsed JWT payload:', payload);
        if (payload?.userId) {
          id = payload.userId;
          Cookies.set(USER_ID_COOKIE, id);
          console.log('Set user ID in cookie:', id);
        }
      }

      // Fallback to cookie if no token in URL
      if (!id) {
        id = Cookies.get(USER_ID_COOKIE);
        console.log('Got user ID from cookie:', id);
      }

      if (!id) {
        console.error('No user ID found in token or cookie');
        return;
      }

      // Create user in D1 database
      try {
        console.log('Creating user in database:', id);
        const response = await fetch('/api/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: id })
        });
        console.log('Create user response:', response.status);
        if (!response.ok) {
          const text = await response.text();
          console.error('Failed to create user:', text);
        }
      } catch (error) {
        console.error('Failed to create user:', error);
      }

      setUserId(id);
    };

    initUser();
  }, []);

  return userId;
}
