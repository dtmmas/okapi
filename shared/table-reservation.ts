export type ReservationGuest = { name: string; address: string; guests: number };
export type ReservationSource = 'ADMIN' | 'KIOSK';
export type TableReservationInfo = ReservationGuest & { source: ReservationSource };
export type ReservationChange =
  | { status: 'FREE' }
  | { status: 'RESERVED'; reservation: ReservationGuest };
