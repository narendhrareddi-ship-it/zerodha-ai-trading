'use client';

import React from 'react';

interface HermesLogoProps {
  size?: number;
  status?: 'active' | 'standby' | 'warning' | 'offline';
  glow?: boolean;
}

export function HermesLogo({ size = 48, status = 'active', glow = true }: HermesLogoProps) {
  // Map status to specific color schemes
  const getStatusColors = () => {
    switch (status) {
      case 'active':
        return {
          core: 'from-cyan-400 to-emerald-400',
          coreGlow: 'rgba(6, 182, 212, 0.85)',
          outer: 'stroke-cyan-500/50',
          inner: 'stroke-teal-400/70',
        };
      case 'warning':
        return {
          core: 'from-rose-500 to-red-600',
          coreGlow: 'rgba(239, 68, 68, 0.95)',
          outer: 'stroke-red-500/50',
          inner: 'stroke-rose-400/70',
        };
      case 'offline':
        return {
          core: 'from-slate-600 to-slate-800',
          coreGlow: 'rgba(100, 116, 139, 0.3)',
          outer: 'stroke-slate-700/40',
          inner: 'stroke-slate-600/50',
        };
      case 'standby':
      default:
        return {
          core: 'from-amber-400 to-orange-500',
          coreGlow: 'rgba(245, 158, 11, 0.8)',
          outer: 'stroke-amber-500/50',
          inner: 'stroke-orange-400/70',
        };
    }
  };

  const colors = getStatusColors();

  return (
    <div 
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        {/* SVG Filter for realistic HUD glow */}
        <defs>
          <filter id="hud-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="wing-cyan" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0891b2" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>

        {/* 1. Outer Arc Reactor ring (dash-array) - rotates clockwise */}
        <circle
          cx="50"
          cy="50"
          r="46"
          className={`${colors.outer} animate-reactor-cw`}
          strokeWidth="1.5"
          strokeDasharray="8 6 12 6"
          fill="none"
        />

        {/* 2. Middle segmented ring (ticks) - rotates counter-clockwise */}
        <circle
          cx="50"
          cy="50"
          r="38"
          className={`${colors.inner} animate-reactor-ccw`}
          strokeWidth="2.5"
          strokeDasharray="2 3 6 4 1 2"
          fill="none"
        />

        {/* 3. Outer Ring Accent Corner brackets */}
        <path d="M 50 2 A 48 48 0 0 1 98 50" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 40" />
        <path d="M 50 98 A 48 48 0 0 1 2 50" stroke="#06b6d4" strokeWidth="1" strokeDasharray="3 40" />

        {/* 4. Stylized Wings of Hermes (Stark Armor HUD plates) */}
        {/* Left Wings */}
        <path
          d="M 40 45 C 32 35, 18 36, 12 40 C 20 44, 30 46, 38 48 M 41 51 C 30 49, 14 52, 8 58 C 16 58, 28 56, 38 53"
          stroke="url(#gold-gradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
        {/* Right Wings */}
        <path
          d="M 60 45 C 68 35, 82 36, 88 40 C 80 44, 70 46, 62 48 M 59 51 C 70 49, 86 52, 92 58 C 84 58, 72 56, 62 53"
          stroke="url(#gold-gradient)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />

        {/* 5. Stark Caduceus center rod (quant anchor) */}
        <line x1="50" y1="26" x2="50" y2="74" stroke="#eab308" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
        <circle cx="50" cy="24" r="3" fill="#f59e0b" />

        {/* 6. Central Arc Reactor Core (pulsing breathing light) */}
        <g className="animate-breathing-stark" style={{ transformOrigin: 'center' }}>
          {/* Inner ring core */}
          <circle
            cx="50"
            cy="50"
            r="15"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            fill="none"
            opacity="0.5"
          />
          {/* Central Reactor Triangle Indicator */}
          <polygon
            points="50,42 58,55 42,55"
            fill="url(#wing-cyan)"
            opacity="0.65"
          />
          {/* Glowing central core circle */}
          <circle
            cx="50"
            cy="50"
            r="6"
            fill="url(#gold-gradient)"
            filter={glow ? 'url(#hud-glow)' : undefined}
          />
        </g>
      </svg>
    </div>
  );
}
