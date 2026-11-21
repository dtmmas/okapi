import { useEffect } from 'react';

export function useTableRefresh(refresh: () => Promise<void>) {
  useEffect(() => {
    let pending = false;
    const reload = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try { await refresh(); } catch { /* Keep the current floor plan until the next refresh. */ }
      finally { pending = false; }
    };
    void reload();
    const interval = window.setInterval(reload, 15000);
    document.addEventListener('visibilitychange', reload);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', reload);
    };
  }, [refresh]);
}
