import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppIcon } from '@/components/AppIcon';
import { useSessionStore } from '@/store/useSessionStore';

type MesasOperationsBackButtonProps = {
  className?: string;
};

export function AdminPanelBackButton({ className = '' }: MesasOperationsBackButtonProps) {
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);

  if (!user?.permissions.includes('DASHBOARD_VIEW')) {
    return null;
  }

  if (user.role === 'WAITER' || user.role === 'CASHIER') {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/mesas?view=operations')}
      className={`inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200/90 bg-slate-100/90 px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-200/80 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08] sm:h-12 sm:text-base lg:h-14 lg:px-5 lg:text-lg ${className}`.trim()}
    >
      <AppIcon icon={ArrowLeft} className="h-4 w-4" />
      Operación de mesas
    </button>
  );
}