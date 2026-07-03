export interface SaleStatusResponse {
  status: 'upcoming' | 'active' | 'ended';
  productId: string;
  remainingStock: number;
  startTime: string;
  endTime: string;
}

export type PurchaseState = 'idle' | 'submitting' | 'success' | 'error' | 'already-purchased' | 'sold-out';

export type CheckResult = 'not-checked' | 'secured' | 'not-secured' | 'checking';

export interface AdminMessage {
  type: 'success' | 'error' | '';
  text: string;
}
