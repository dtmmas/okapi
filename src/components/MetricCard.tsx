import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { AppIcon } from '@/components/AppIcon';
import type { DashboardMetric } from '@/types/restaurant';
import { cn } from '@/lib/utils';

const trendIcon = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  neutral: ArrowRight,
};

const trendColor = {
  up: 'text-emerald-600 dark:text-emerald-300',
  down: 'text-rose-600 dark:text-rose-300',
  neutral: 'text-slate-500 dark:text-zinc-300',
};

type MetricCardProps = {
  metric: DashboardMetric;
};

export function MetricCard({ metric }: MetricCardProps) {
  const Icon = trendIcon[metric.trend];

  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/8 dark:bg-zinc-950/50 dark:shadow-none">
      <p className="text-xs uppercase tracking-[0.28em] text-slate-500 dark:text-zinc-500">{metric.label}</p>
      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="font-display text-3xl text-slate-950 dark:text-white">{metric.value}</p>
          <p className={cn('mt-2 flex items-center gap-2 text-sm', trendColor[metric.trend])}>
            <AppIcon icon={Icon} className="h-4 w-4" />
            {metric.change}
          </p>
        </div>
      </div>
    </div>
  );
}
