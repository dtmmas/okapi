export type ReservationGuest = { name: string; address: string; guests: number; phone?: string; observations?: string };
export type ReservationSource = 'ADMIN' | 'KIOSK';
export type TableReservationInfo = ReservationGuest & { source: ReservationSource };
export type ReservationChange =
  | { status: 'FREE'; reason?: string }
  | { status: 'RESERVED'; reservation: ReservationGuest };
