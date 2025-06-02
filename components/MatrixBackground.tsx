import React, { useEffect, useRef } from 'react';

const MatrixBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Matrix characters
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const charArray = chars.split('');

    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = [];

    // Initialize drops
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * canvas.height;
    }

    const draw = () => {
      // Create fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#00ff41';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Random character
        const text = charArray[Math.floor(Math.random() * charArray.length)];

        // Draw character
        ctx.fillStyle = `rgba(0, 255, 65, ${Math.random() * 0.8 + 0.2})`;
        ctx.fillText(text, i * fontSize, drops[i]);

        // Move drop down
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i] += fontSize;
      }
    };

    // Animation loop
    const interval = setInterval(draw, 100);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <>
      {/* Matrix rain canvas */}
      <canvas
        ref={canvasRef}
        className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 opacity-30"
      />

      {/* Floating particles */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-neon-green rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
            }}
          />
        ))}
      </div>

      {/* Scanning lines */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div
          className="absolute w-full h-px bg-gradient-to-r from-transparent via-neon-green to-transparent opacity-30"
          style={{
            top: '20%',
            animation: 'scan-line 4s linear infinite',
          }}
        />
        <div
          className="absolute w-full h-px bg-gradient-to-r from-transparent via-neon-blue to-transparent opacity-20"
          style={{
            top: '60%',
            animation: 'scan-line 6s linear infinite reverse',
          }}
        />
      </div>

      {/* Corner grids */}
      <div className="fixed top-0 left-0 w-32 h-32 pointer-events-none z-0">
        <div className="w-full h-full bg-grid-pattern bg-grid opacity-20"></div>
      </div>
      <div className="fixed top-0 right-0 w-32 h-32 pointer-events-none z-0">
        <div className="w-full h-full bg-grid-pattern bg-grid opacity-20"></div>
      </div>
      <div className="fixed bottom-0 left-0 w-32 h-32 pointer-events-none z-0">
        <div className="w-full h-full bg-grid-pattern bg-grid opacity-20"></div>
      </div>
      <div className="fixed bottom-0 right-0 w-32 h-32 pointer-events-none z-0">
        <div className="w-full h-full bg-grid-pattern bg-grid opacity-20"></div>
      </div>

      <style jsx>{`
        @keyframes scan-line {
          0% { transform: translateY(-100vh); }
          100% { transform: translateY(100vh); }
        }
      `}</style>
    </>
  );
};

export default MatrixBackground;