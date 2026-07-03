import { useState, useEffect } from 'react';
import { SaleStatusResponse } from '../types';

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
}

export function useCountdown(status: SaleStatusResponse | null) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    if (!status) return;

    let targetTime = 0;
    if (status.status === 'upcoming') {
      targetTime = new Date(status.startTime).getTime();
    } else if (status.status === 'active') {
      targetTime = new Date(status.endTime).getTime();
    }

    if (!targetTime) {
      setTimeLeft(null);
      return;
    }

    const updateTime = () => {
      const now = new Date().getTime();
      const distance = targetTime - now;

      if (distance <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
      } else {
        const hours = Math.floor(distance / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft({ hours, minutes, seconds });
      }
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [status]);

  return timeLeft;
}
