import React from 'react';

interface BlobBackgroundProps {
  className?: string;
}

export function BlobBackground({ className }: BlobBackgroundProps) {
  return (
    <div className={`fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-[-1] ${className || ""}`}>
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-blob" />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-blue-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-2000" />
      <div className="absolute -bottom-32 left-1/3 w-96 h-96 bg-pink-600/30 rounded-full mix-blend-screen filter blur-[100px] animate-blob animation-delay-4000" />

      {/* Grid overlay for texture */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
    </div>
  );
}
