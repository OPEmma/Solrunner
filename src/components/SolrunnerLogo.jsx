export function SolrunnerLogo({ className = "w-8 h-8" }) {
  return (
    <div className={`relative flex items-center justify-center p-2 rounded-xl bg-zinc-950 border border-zinc-800 shadow-lg shadow-purple-900/20 group hover:border-zinc-700 transition-all duration-300 ${className}`}>
      {/* Glow Effect */}
      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-600 opacity-20 blur-md group-hover:opacity-40 transition-opacity" />

      {/* Solana "S" SVG */}
      <svg 
        className="relative w-full h-full text-transparent" 
        viewBox="0 0 397 311" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="solana-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" className="text-[#00FFA3]" stopColor="currentColor" />
            <stop offset="50%" className="text-[#00DCFF]" stopColor="currentColor" />
            <stop offset="100%" className="text-[#9945FF]" stopColor="currentColor" />
          </linearGradient>
        </defs>

        {/* Top Bar */}
        <path 
          d="M64.6 237.9c2.4-2.4 5.7-3.8 9.1-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.1 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z" 
          fill="url(#solana-gradient)" 
        />
        {/* Middle Bar */}
        <path 
          d="M64.6 3.8C67 1.4 70.3 0 73.7 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.1 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z" 
          fill="url(#solana-gradient)" 
        />
        {/* Bottom Bar */}
        <path 
          d="M332.1 120.1c-2.4-2.4-5.7-3.8-9.1-3.8H5.6c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.1 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z" 
          fill="url(#solana-gradient)" 
        />
      </svg>
    </div>
  );
}