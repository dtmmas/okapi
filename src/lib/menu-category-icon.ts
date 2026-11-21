import { Beef, CakeSlice, ChefHat, Coffee, Fish, GlassWater, IceCreamCone, Martini, Pizza, Salad, Sandwich } from 'lucide-react';
import type { MenuCategory } from '@/types/restaurant';

export function getCategoryIcon(category: MenuCategory) {
  const name = category.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/pizza/.test(name)) return Pizza;
  if (/hamburg|burger|sandwich|panini/.test(name)) return Sandwich;
  if (/ensalada|veg/.test(name)) return Salad;
  if (/carne|pollo|parrilla|\bres\b/.test(name)) return Beef;
  if (/marisco|pescado|ceviche/.test(name)) return Fish;
  if (/cafe|desayuno/.test(name)) return Coffee;
  if (/helado/.test(name)) return IceCreamCone;
  if (/postre|torta|pastel|dulce/.test(name)) return CakeSlice;
  if (/bebida|refresco|jugo|soda/.test(name)) return GlassWater;
  if (/licor|coctel|vino|cerveza/.test(name) || category.station === 'BAR') return Martini;
  return category.station === 'PASTRY' ? CakeSlice : ChefHat;
}
