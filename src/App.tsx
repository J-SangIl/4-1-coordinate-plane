/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Bomb, RotateCcw, Ghost as GhostIcon, Eye, EyeOff, Crosshair, Volume2, VolumeX } from 'lucide-react';
import { Howl, Howler } from 'howler';

// --- Constants ---
const BOARD_SIZE = 600;
const GRID_UNIT = 60; // 60px per coordinate unit
const ORIGIN = BOARD_SIZE / 2;
const HIT_RADIUS = 22; // Adjusted for reduced ghost size (3/4 of 30)

type GameStep = 'START' | 'MOVING' | 'MOVE_DONE' | 'HIDDEN' | 'AIMED' | 'RESULT';

interface Position {
  x: number; // Coordinate unit (-5 to 5)
  y: number; // Coordinate unit (-5 to 5)
}

interface PixelPos {
  left: number;
  top: number;
}

// --- Components ---

const Ghost = ({ 
  expression, 
  visible 
}: { 
  expression: 'normal' | 'dead' | 'teasing', 
  visible: boolean 
}) => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
      className="relative w-[30px] h-[30px] flex items-center justify-center pointer-events-none"
      style={{ zIndex: 20 }}
    >
      <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
        {/* Ghost Body */}
        <path
          d="M20 80 Q20 20 50 20 Q80 20 80 80 L70 75 L60 80 L50 75 L40 80 L30 75 L20 80 Z"
          fill="#60a5fa"
        />
        {/* Eyes */}
        {expression === 'dead' ? (
          <>
            <path d="M35 40 L45 50 M45 40 L35 50" stroke="white" strokeWidth="4" strokeLinecap="round" />
            <path d="M55 40 L65 50 M65 40 L55 50" stroke="white" strokeWidth="4" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="40" cy="45" r="5" fill={expression === 'teasing' ? '#ef4444' : 'white'} />
            <circle cx="60" cy="45" r="5" fill={expression === 'teasing' ? '#ef4444' : 'white'} />
          </>
        )}
        
        {/* Mouth */}
        {expression === 'normal' && (
          <path d="M45 60 Q50 65 55 60" stroke="white" fill="none" strokeWidth="2" />
        )}
        {expression === 'dead' && (
          <path d="M40 65 Q50 60 60 65" stroke="white" fill="none" strokeWidth="2" />
        )}
        {expression === 'teasing' && (
          <path d="M40 65 Q50 55 60 65" stroke="white" fill="none" strokeWidth="2" />
        )}
      </svg>
    </motion.div>
  );
};

export default function App() {
  const [step, setStep] = useState<GameStep>('START');
  const [ghostPos, setGhostPos] = useState<Position>({ x: 0, y: 0 });
  const [ghostAnimation, setGhostAnimation] = useState<any>({});
  const [targetPos, setTargetPos] = useState<PixelPos | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [message, setMessage] = useState('유령 이동 버튼을 눌러 게임을 시작하세요!');
  const [showExplosion, setShowExplosion] = useState(false);
  const [bombPath, setBombPath] = useState<PixelPos[] | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);

  // Sound effects
  const sfx = useMemo(() => ({
    bgm: new Howl({ src: ['https://cdn.pixabay.com/audio/2024/02/14/audio_765c52c676.mp3'], loop: true, volume: 0.2, html5: true }),
    move: new Howl({ src: ['https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a11ed4.mp3'], volume: 0.5 }),
    hide: new Howl({ src: ['https://cdn.pixabay.com/audio/2021/08/04/audio_06d8a24564.mp3'], volume: 0.6 }),
    fire: new Howl({ src: ['https://cdn.pixabay.com/audio/2022/08/03/audio_710488661b.mp3'], volume: 0.5 }),
    explode: new Howl({ src: ['https://cdn.pixabay.com/audio/2022/03/10/audio_b281f62c5e.mp3'], volume: 0.6 }),
    success: new Howl({ src: ['https://cdn.pixabay.com/audio/2021/08/04/audio_13a177242c.mp3'], volume: 0.7 }),
    fail: new Howl({ src: ['https://cdn.pixabay.com/audio/2022/03/15/audio_7314787a74.mp3'], volume: 0.6 }),
  }), []);

  useEffect(() => {
    if (soundEnabled) {
      sfx.bgm.play();
    } else {
      sfx.bgm.pause();
    }
    return () => {
      sfx.bgm.stop();
    };
  }, [soundEnabled, sfx.bgm]);

  const playSfx = (name: keyof typeof sfx) => {
    if (soundEnabled && name !== 'bgm') {
      // Ensure context is resumed for mobile/tablet
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume();
      }
      sfx[name].play();
    }
  };

  const toggleSound = () => {
    if (!soundEnabled) {
      // Force resume AudioContext on first activation
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume();
      }
    }
    setSoundEnabled(!soundEnabled);
  };

  // Convert coordinate units to pixels
  const coordToPixel = (pos: Position): PixelPos => ({
    left: ORIGIN + pos.x * GRID_UNIT,
    top: ORIGIN - pos.y * GRID_UNIT, // Y is inverted in screen space
  });

  // Convert pixels to coordinate units (for snapping)
  const pixelToCoord = (left: number, top: number): Position => ({
    x: Math.round((left - ORIGIN) / GRID_UNIT),
    y: Math.round((ORIGIN - top) / GRID_UNIT),
  });

  const handleMoveGhost = () => {
    setStep('MOVING');
    setMessage('이동 중...');
    playSfx('move');
    
    // Function to generate a random coordinate with |val| > 0.5 in 0.25 increments
    const getRandomCoord = () => {
      let val;
      do {
        // Range -4 to 4 in 0.25 steps (33 possible values)
        val = (Math.floor(Math.random() * 33) - 16) * 0.25;
      } while (Math.abs(val) <= 0.5);
      return val;
    };

    const finalX = getRandomCoord();
    const finalY = getRandomCoord();
    const finalPixel = coordToPixel({ x: finalX, y: finalY });

    // Generate intermediate points for a wandering effect
    const intermediatePoints = Array.from({ length: 4 }).map(() => ({
      left: Math.random() * (BOARD_SIZE - 100) + 50,
      top: Math.random() * (BOARD_SIZE - 100) + 50,
    }));

    setGhostAnimation({
      left: [...intermediatePoints.map(p => p.left), finalPixel.left],
      top: [...intermediatePoints.map(p => p.top), finalPixel.top],
      transition: { duration: 3, ease: "easeInOut" }
    });
    
    setTimeout(() => {
      setGhostPos({ x: finalX, y: finalY });
      setGhostAnimation({}); // Reset to static position
      setStep('MOVE_DONE');
      setMessage('위치 설명 중');
    }, 3000);
  };

  const handleHideGhost = () => {
    setStep('HIDDEN');
    setMessage('유령 숨음');
    playSfx('hide');
  };

  const handleBoardClick = (e: React.MouseEvent) => {
    if (step !== 'HIDDEN' && step !== 'AIMED') return;

    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Subtract border width (3px) to align correctly with absolute positioning
    const borderWidth = 3;
    const x = e.clientX - rect.left - borderWidth;
    const y = e.clientY - rect.top - borderWidth;

    setTargetPos({ left: x, top: y });
    setStep('AIMED');
    setMessage('조준 완료');
  };

  const handleFireBomb = () => {
    if (!targetPos) return;
    
    setStep('RESULT');
    setMessage('발사!');
    playSfx('fire');

    // Animate bomb from origin to target
    setBombPath([{ left: ORIGIN, top: ORIGIN }, targetPos]);

    setTimeout(() => {
      setShowExplosion(true);
      setBombPath(null);
      playSfx('explode');

      // Judge result
      const ghostPixel = coordToPixel(ghostPos);
      const dist = Math.sqrt(
        Math.pow(targetPos.left - ghostPixel.left, 2) + 
        Math.pow(targetPos.top - ghostPixel.top, 2)
      );

      setTimeout(() => {
        setShowExplosion(false);
        if (dist <= HIT_RADIUS) {
          setMessage('성공! 🎉');
          playSfx('success');
        } else {
          setMessage('실패! 👻');
          playSfx('fail');
        }
      }, 1000);
    }, 800);
  };

  const handleReset = () => {
    setStep('START');
    setGhostPos({ x: 0, y: 0 });
    setGhostAnimation({});
    setTargetPos(null);
    setShowExplosion(false);
    setBombPath(null);
    setMessage('준비');
  };

  const ghostPixel = coordToPixel(ghostPos);

  return (
    <div className="h-screen flex flex-col items-center p-2 bg-bg overflow-hidden">
      {/* Header */}
      <div className="w-full max-w-7xl flex justify-between items-center py-2 px-10">
        <div className="w-32" /> {/* Spacer */}
        <h1 id="title" className="text-2xl font-extrabold text-primary tracking-tight">
          👻 유령 잡기
        </h1>
        <button
          onClick={toggleSound}
          className={`p-2 rounded-full transition-all border-2 ${
            soundEnabled 
            ? 'bg-primary text-white border-primary' 
            : 'bg-white text-muted border-slate-200 hover:border-primary hover:text-primary shadow-sm'
          }`}
          title={soundEnabled ? '소리 끄기' : '소리 켜기'}
        >
          {soundEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
        </button>
      </div>

      <div className="flex gap-4 max-w-7xl w-full flex-1 justify-center items-stretch overflow-hidden pb-4">
        {/* Left: Game Board Area */}
        <div className="flex-1 bg-white border-2 border-slate-200 rounded-3xl shadow-inner flex items-center justify-center p-4 relative">
          <div 
            ref={boardRef}
            onClick={handleBoardClick}
            className="relative bg-board-bg border-3 border-text shadow-2xl overflow-hidden cursor-crosshair"
            style={{ width: BOARD_SIZE, height: BOARD_SIZE }}
          >
            {/* Grid Lines */}
            {showGrid && (
              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: BOARD_SIZE / GRID_UNIT + 1 }).map((_, i) => (
                  <React.Fragment key={i}>
                    <div 
                      className="absolute bg-grid-line" 
                      style={{ left: i * GRID_UNIT, top: 0, bottom: 0, width: 1 }} 
                    />
                    <div 
                      className="absolute bg-grid-line" 
                      style={{ top: i * GRID_UNIT, left: 0, right: 0, height: 1 }} 
                    />
                  </React.Fragment>
                ))}
                {/* Main Axes */}
                <div className="absolute bg-slate-300" style={{ left: ORIGIN - 0.5, top: 0, bottom: 0, width: 2 }} />
                <div className="absolute bg-slate-300" style={{ top: ORIGIN - 0.5, left: 0, right: 0, height: 2 }} />
              </div>
            )}

            {/* Origin Point */}
            <div 
              className="absolute w-2.5 h-2.5 bg-accent rounded-full shadow-[0_0_0_3px_rgba(239,68,68,0.2)] -translate-x-1/2 -translate-y-1/2"
              style={{ left: ORIGIN, top: ORIGIN, zIndex: 10 }}
            />

            {/* Ghost */}
            <motion.div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              animate={step === 'MOVING' ? ghostAnimation : { 
                left: ghostPixel.left, 
                top: ghostPixel.top 
              }}
              style={{ zIndex: 20 }}
            >
              <Ghost 
                visible={step !== 'HIDDEN' && step !== 'AIMED' && !(step === 'RESULT' && bombPath)} 
                expression={
                  step === 'RESULT' && !showExplosion && !bombPath
                  ? (message.includes('성공') ? 'dead' : 'teasing')
                  : 'normal'
                }
              />
            </motion.div>

            {/* Target Crosshair */}
            {targetPos && (step === 'HIDDEN' || step === 'AIMED' || step === 'RESULT') && (
              <div 
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{ left: targetPos.left, top: targetPos.top, zIndex: 30 }}
              >
                <div className="relative w-8 h-8 border-2 border-accent rounded-full flex items-center justify-center">
                  <div className="absolute w-10 h-0.5 bg-accent" />
                  <div className="absolute h-10 w-0.5 bg-accent" />
                </div>
              </div>
            )}

            {/* Bomb Animation */}
            <AnimatePresence>
              {bombPath && (
                <motion.div
                  initial={{ left: bombPath[0].left, top: bombPath[0].top, scale: 0.5 }}
                  animate={{ left: bombPath[1].left, top: bombPath[1].top, scale: 1.2 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8, ease: "easeIn" }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-3xl"
                  style={{ zIndex: 40 }}
                >
                  💣
                </motion.div>
              )}
            </AnimatePresence>

            {/* Explosion Effect */}
            <AnimatePresence>
              {showExplosion && targetPos && (
                <motion.div
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: [1, 2, 1.5], opacity: [0, 1, 0] }}
                  transition={{ duration: 1 }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-5xl"
                  style={{ left: targetPos.left, top: targetPos.top, zIndex: 50 }}
                >
                  💥
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Controls & Info */}
        <div className="flex flex-col gap-4 w-80 overflow-y-auto">
          {/* Message Box */}
          <div id="message-box" className="bg-white border border-grid-line rounded-2xl px-4 py-4 shadow-sm min-h-[70px] flex items-center justify-center font-black text-2xl text-primary text-center">
            {message}
          </div>

          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-5 py-4 rounded-xl font-bold transition-all border-2 text-lg shadow-sm ${
              showGrid 
              ? 'bg-primary text-white border-primary' 
              : 'bg-white text-primary border-primary hover:bg-blue-50'
            }`}
          >
            모눈종이 {showGrid ? '끄기' : '켜기'}
          </button>

          <div className="bg-white p-5 rounded-2xl shadow-lg border border-slate-200 flex flex-col gap-3">
            <button
              onClick={handleMoveGhost}
              disabled={step !== 'START'}
              className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all text-lg ${
                step === 'START'
                ? 'bg-primary text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:-translate-y-0.5'
                : 'bg-grid-line text-muted cursor-not-allowed opacity-50'
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">1</span>
              1단계: 유령 이동
            </button>

            <button
              onClick={handleHideGhost}
              disabled={step !== 'MOVE_DONE'}
              className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all text-lg ${
                step === 'MOVE_DONE'
                ? 'bg-primary text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:-translate-y-0.5'
                : 'bg-grid-line text-muted cursor-not-allowed opacity-50'
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">2</span>
              2단계: 유령 숨기기
            </button>

            <button
              onClick={handleFireBomb}
              disabled={step !== 'AIMED'}
              className={`flex items-center gap-3 p-4 rounded-xl font-bold transition-all text-lg ${
                step === 'AIMED'
                ? 'bg-primary text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:-translate-y-0.5'
                : 'bg-grid-line text-muted cursor-not-allowed opacity-50'
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-black/10 flex items-center justify-center text-sm">3</span>
              3단계: 폭탄 발사
            </button>

            <button
              onClick={handleReset}
              className="flex items-center gap-3 p-4 rounded-xl font-bold bg-text text-white hover:bg-black transition-all mt-2 text-lg shadow-md"
            >
              ↻ 다시 시작
            </button>
          </div>

          {/* Location Description Box */}
          <div className="flex-1 flex flex-col min-h-[150px]">
            <textarea 
              className="flex-1 w-full p-5 bg-white border border-grid-line rounded-2xl shadow-inner resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 text-base font-medium"
              placeholder="여기에 위치 설명을 적으세요..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
