import { useCallback, useEffect, useState } from 'react';

export interface NotificationQuota {
  limit: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email?: string | null;
  notificationQuota: NotificationQuota;
}

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/user');
      if (!response.ok) {
        throw new Error('Failed to load profile');
      }
      const data = await response.json();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load profile');
    } finally {
      setLoading(false);
    }
  }, []);

  const updateEmail = useCallback(
    async (email: string) => {
      const response = await fetch('/api/user', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update email');
      }

      const data = await response.json();
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              email: data.email,
            }
          : data
      );
      window.dispatchEvent(new Event('kowiz-profile-updated'));
      return data;
    },
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { profile, loading, error, refresh, updateEmail };
}
