import type { AuthUser } from '@/types/restaurant';

export function getPostLoginPath(user: AuthUser) {
  if (user.role === 'KITCHEN') {
    return '/kds?station=KITCHEN';
  }

  if (user.role === 'BAR') {
    return '/kds?station=BAR';
  }

  if (user.role === 'PASTRY') {
    return '/kds?station=PASTRY';
  }

  if (user.role === 'DELIVERY') {
    return '/delivery';
  }

  if (user.role === 'WAITER') {
    return '/pos';
  }

  if (user.role === 'CASHIER') {
    return '/cashier/mesas';
  }

  return '/dashboard';
}
