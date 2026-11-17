import {
  Armchair,
  ChefHat,
  DoorOpen,
  GlassWater,
  Home,
  type LucideIcon,
  Sparkles,
  Store,
  Trees,
  Users,
  UtensilsCrossed,
} from 'lucide-react';

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function getAreaIcon(area: string): LucideIcon {
  const name = normalize(area);

  if (name.includes('terraza') || name.includes('patio') || name.includes('jardin')) {
    return Trees;
  }
  if (name.includes('vip') || name.includes('premium') || name.includes('lounge')) {
    return Sparkles;
  }
  if (name.includes('familiar') || name.includes('familia') || name.includes('grupo')) {
    return Users;
  }
  if (name.includes('barra') || name.includes('bar')) {
    return GlassWater;
  }
  if (name.includes('cocina')) {
    return ChefHat;
  }
  if (name.includes('salon') || name.includes('comedor')) {
    return Armchair;
  }
  if (name.includes('entrada') || name.includes('recepcion')) {
    return DoorOpen;
  }
  if (name.includes('principal') || name.includes('central')) {
    return Store;
  }
  if (name.includes('casa') || name.includes('interna')) {
    return Home;
  }

  return UtensilsCrossed;
}
