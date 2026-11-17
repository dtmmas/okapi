import type { ComponentType, SVGProps } from 'react';

export type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

type AppIconProps = {
  icon: IconComponent;
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
};

export function AppIcon({ icon: Icon, className, size, strokeWidth = 1.75 }: AppIconProps) {
  return <Icon aria-hidden="true" focusable="false" className={className} size={size} strokeWidth={strokeWidth} />;
}
