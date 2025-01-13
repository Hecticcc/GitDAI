import React from 'react';
import { Clock } from 'lucide-react';

interface ServerTimerProps {
  startTime: number;
  duration: number; // Duration in milliseconds
  onExpire: () => void;
}

export function ServerTimer({ startTime, duration, onExpire }: ServerTimerProps) {
  const [timeLeft, setTimeLeft] = React.useState(duration);
  const [isWarning, setIsWarning] = React.useState(false);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = duration - elapsed;
      
      if (remaining <= 0) {
        clearInterval(interval);
        onExpire();
        return;
      }
      
      setTimeLeft(remaining);
      
      // Set warning state when 90 seconds or less remain
      if (remaining <= 90000 && !isWarning) {
        setIsWarning(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, duration, onExpire]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-all duration-300 ${
      isWarning 
        ? 'bg-red-500/10 text-red-400 animate-pulse'
        : 'bg-[#2F3136] text-gray-300'
    }`}>
      <Clock className="w-4 h-4" />
      <div className="text-sm font-medium">
        Server expires in: {formatTime(timeLeft)}
      </div>
    </div>
  );
}