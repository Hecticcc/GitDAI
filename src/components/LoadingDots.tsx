import React from 'react';

export function LoadingDots() {
  return (
    <div className="flex space-x-1 items-center">
      <div className="w-2 h-2 bg-[#7289DA] rounded-full animate-[bounce_0.7s_infinite]" />
      <div className="w-2 h-2 bg-[#7289DA] rounded-full animate-[bounce_0.7s_0.2s_infinite]" />
      <div className="w-2 h-2 bg-[#7289DA] rounded-full animate-[bounce_0.7s_0.4s_infinite]" />
    </div>
  );
}