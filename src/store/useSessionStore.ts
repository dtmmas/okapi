import { create } from 'zustand';
import { authTokenKey, getBootstrapSnapshot, getCurrentUser, loginRequest } from '@/services/api';
import type { AuthUser, RestaurantSnapshot } from '@/types/restaurant';

type SessionState = {
  token: string | null;
  user: AuthUser | null;
  snapshot: RestaurantSnapshot | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  hydrate: () => Promise<void>;
  refreshSnapshot: () => Promise<void>;
  logout: () => void;
};

export const useSessionStore = create<SessionState>((set, get) => ({
  token: localStorage.getItem(authTokenKey),
  user: null,
  snapshot: null,
  loading: false,
  error: null,
  async login(email, password) {
    set({ loading: true, error: null });

    try {
      const data = await loginRequest(email, password);
      localStorage.setItem(authTokenKey, data.accessToken);
      const snapshot = await getBootstrapSnapshot();
      set({
        token: data.accessToken,
        user: data.user,
        snapshot,
        loading: false,
      });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'No fue posible iniciar sesion.',
      });
      throw error;
    }
  },
  async hydrate() {
    if (!get().token) {
      return;
    }

    set({ loading: true, error: null });

    try {
      const [user, snapshot] = await Promise.all([getCurrentUser(), getBootstrapSnapshot()]);
      set({ user, snapshot, loading: false });
    } catch {
      localStorage.removeItem(authTokenKey);
      set({ token: null, user: null, snapshot: null, loading: false });
    }
  },
  async refreshSnapshot() {
    if (!get().token) {
      return;
    }

    const snapshot = await getBootstrapSnapshot();
    set({ snapshot });
  },
  logout() {
    localStorage.removeItem(authTokenKey);
    set({ token: null, user: null, snapshot: null, error: null });
  },
}));
