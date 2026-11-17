import type { PropsWithChildren, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PanelProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}>;

export function Panel({ title, subtitle, action, className, children }: PanelProps) {
  return (
    <section
      className={cn(
        'rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.04] dark:shadow-[0_24px_80px_rgba(0,0,0,0.22)]',
        className,
      )}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-lg text-slate-950 dark:text-white">{title}</p>
          {subtitle ? <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
