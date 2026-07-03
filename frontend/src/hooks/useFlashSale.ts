import { useState, useEffect, useCallback } from 'react';
import { SaleStatusResponse } from '../types';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export function useFlashSale() {
  const [status, setStatus] = useState<SaleStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState(false);
  const [, setRetryCount] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/flash-sale/status`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: SaleStatusResponse = await res.json();
      setStatus(data);
      setStatusError(false);
      setStatusLoading(false);
      setRetryCount(0); // Reset retry count on success
    } catch (err) {
      console.error('Error fetching sale status:', err);
      setRetryCount(prev => {
        const nextCount = prev + 1;
        // If we have failed 5 times (about 10 seconds), then show the error
        if (nextCount >= 5) {
          setStatusError(true);
          setStatusLoading(false);
        }
        return nextCount;
      });
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Short polling for sale status
    const interval = setInterval(fetchStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const updateStatus = (newData: Partial<SaleStatusResponse>) => {
    setStatus(prev => prev ? { ...prev, ...newData } : null);
  };

  return { status, statusLoading, statusError, updateStatus, fetchStatus };
}
