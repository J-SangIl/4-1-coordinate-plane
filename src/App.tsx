/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Bomb, RotateCcw, Ghost as GhostIcon, Eye, EyeOff, Crosshair } from 'lucide-react';

// --- Constants ---
const BOARD_SIZE = 500;
const GRID_UNIT = 50; // 50px per coordinate unit
const ORIGIN = BOARD_SIZE / 2;
const HIT_RADIUS = 30; // Tolerance for hitting the ghost

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

  const boardRef = useRef<HTMLDivElement>(null);

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
    setMessage('유령이 이동 중입니다...');
    
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
      setMessage('유령의 위치를 설명하고, 유령 숨기기 버튼을 누르세요!');
    }, 3000);
  };

  const handleHideGhost = () => {
    setStep('HIDDEN');
    setMessage('유령이 숨었습니다. 유령이 있을 것 같은 곳을 클릭하여 조준하세요!');
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
    setMessage('조준 완료! 폭탄 발사 버튼을 누르세요!');
  };

  const handleFireBomb = () => {
    if (!targetPos) return;
    
    setStep('RESULT');
    setMessage('폭탄 발사!');

    // Animate bomb from origin to target
    setBombPath([{ left: ORIGIN, top: ORIGIN }, targetPos]);

    setTimeout(() => {
      setShowExplosion(true);
      setBombPath(null);

      // Judge result
      const ghostPixel = coordToPixel(ghostPos);
      const dist = Math.sqrt(
        Math.pow(targetPos.left - ghostPixel.left, 2) + 
        Math.pow(targetPos.top - ghostPixel.top, 2)
      );

      setTimeout(() => {
        setShowExplosion(false);
        if (dist <= HIT_RADIUS) {
          setMessage('성공! 유령을 잡았습니다! 🎉');
        } else {
          setMessage('실패! 유령이 도망갔습니다. 👻');
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
    setMessage('유령 이동 버튼을 눌러 게임을 시작하세요!');
  };

  const ghostPixel = coordToPixel(ghostPos);

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      {/* Header */}
      <div className="w-full max-w-6xl flex justify-between items-center mb-8 px-4">
        <h1 id="title" className="text-3xl font-extrabold text-primary tracking-tight">
          👻 유령 잡기
        </h1>
        <div className="flex items-center gap-5 flex-1 mx-10">
          <div id="message-box" className="flex-1 bg-white border border-grid-line rounded-xl px-6 py-3 shadow-sm min-h-[54px] flex items-center font-semibold text-text">
            {message}
          </div>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-5 py-2.5 rounded-lg font-bold transition-all border-2 ${
              showGrid 
              ? 'bg-primary text-white border-primary' 
              : 'bg-white text-primary border-primary hover:bg-blue-50'
            }`}
          >
            모눈종이 {showGrid ? '끄기' : '켜기'}
          </button>
        </div>
      </div>

      <div className="flex gap-8 max-w-6xl w-full justify-center">
        {/* Game Board */}
        <div 
          ref={boardRef}
          onClick={handleBoardClick}
          className="relative bg-board-bg border-3 border-text shadow-xl overflow-hidden cursor-crosshair"
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

        {/* Right: Control Buttons */}
        <div className="w-[220px] flex flex-col gap-4">
          <button
            onClick={handleMoveGhost}
            disabled={step !== 'START'}
            className={`flex items-center gap-3 p-4.5 rounded-xl font-bold transition-all ${
              step === 'START'
              ? 'bg-primary text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:-translate-y-0.5'
              : 'bg-grid-line text-muted cursor-not-allowed opacity-50'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center text-xs">1</span>
            1단계: 유령 이동
          </button>

          <button
            onClick={handleHideGhost}
            disabled={step !== 'MOVE_DONE'}
            className={`flex items-center gap-3 p-4.5 rounded-xl font-bold transition-all ${
              step === 'MOVE_DONE'
              ? 'bg-primary text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:-translate-y-0.5'
              : 'bg-grid-line text-muted cursor-not-allowed opacity-50'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center text-xs">2</span>
            2단계: 유령 숨기기
          </button>

          <button
            onClick={handleFireBomb}
            disabled={step !== 'AIMED'}
            className={`flex items-center gap-3 p-4.5 rounded-xl font-bold transition-all ${
              step === 'AIMED'
              ? 'bg-primary text-white shadow-[0_4px_12px_rgba(59,130,246,0.3)] hover:-translate-y-0.5'
              : 'bg-grid-line text-muted cursor-not-allowed opacity-50'
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-black/10 flex items-center justify-center text-xs">3</span>
            3단계: 폭탄 발사
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-3 p-4.5 rounded-xl font-bold bg-text text-white hover:bg-black transition-all mt-5"
          >
            ↻ 다시 시작
          </button>

          <div className="mt-auto p-4 bg-slate-100 rounded-xl text-xs leading-relaxed text-slate-600">
            <strong className="block mb-1 text-text">도움말</strong>
            설명을 듣고 유령의 위치를 클릭하세요. 눈금을 켜서 좌표를 확인할 수 있습니다.
          </div>
        </div>
      </div>
    </div>
  );
}
