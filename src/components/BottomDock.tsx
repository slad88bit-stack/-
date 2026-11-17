import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  EMOTIONS,
  type AnimationId,
  type AnimationMeta,
  type EmotionId,
} from '../types/vtuber';

interface BottomDockProps {
  emotion: EmotionId;
  animationMode: AnimationId;
  animations: AnimationMeta[];
  darkUi: boolean;
  onSelectEmotion: (emotion: EmotionId) => void;
  onSelectAnimation: (anim: AnimationId) => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  emotion,
  animationMode,
  animations,
  darkUi,
  onSelectEmotion,
  onSelectAnimation,
}) => {
  const panelClass = darkUi
    ? 'glass-panel-dark text-slate-100'
    : 'glass-panel text-slate-800';

  const dividerClass = darkUi ? 'bg-white/15' : 'bg-slate-900/10';
  const idleBtn = darkUi
    ? 'text-slate-300 hover:bg-white/10 hover:text-white'
    : 'text-slate-700 hover:bg-slate-900/6 hover:text-slate-950';

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-3 sm:pb-3">
      <div
        className={`pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-2xl p-1 lg:flex-nowrap lg:gap-2 lg:px-2.5 lg:py-1.5 ${panelClass}`}
      >
        {/* 8 Live VTuber Expressions (Hotkeys 1-8) */}
        <div
          className="no-scrollbar flex max-w-full items-center gap-0.5 overflow-x-auto sm:gap-1"
          role="group"
          aria-label="Эмоции персонажа"
        >
          {EMOTIONS.map((em) => {
            const active = emotion === em.id;
            return (
              <button
                key={em.id}
                type="button"
                onClick={() => onSelectEmotion(em.id)}
                title={`${em.label} (клавиша ${em.hotkey})`}
                className={`group relative flex shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl px-1.5 py-1 transition-all sm:px-2 sm:py-1.5 lg:min-w-[50px] ${
                  active
                    ? darkUi
                      ? 'bg-white/18 text-white ring-1 ring-amber-400/60 shadow-sm'
                      : 'bg-amber-400/25 text-slate-950 ring-1 ring-amber-500/50 shadow-sm'
                    : idleBtn
                }`}
              >
                <span className="text-base leading-none transition-transform group-hover:scale-110 sm:text-lg">
                  {em.emoji}
                </span>
                <span className="mt-1 hidden text-[9.5px] font-semibold leading-none lg:block">
                  {em.label}
                </span>
                <span
                  className={`absolute right-1 top-0.5 hidden font-mono-tech text-[8.5px] font-semibold opacity-45 lg:block ${
                    active ? 'opacity-80' : ''
                  }`}
                >
                  {em.hotkey}
                </span>
              </button>
            );
          })}
        </div>

        <div className={`hidden h-8 w-px shrink-0 lg:block ${dividerClass}`} />

        {/* Active Character's Authentic Animations + Live VTuber Mode */}
        <div
          className="no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto"
          role="group"
          aria-label="Анимации персонажа"
        >
          {animations.map((anim) => {
            const active = animationMode === anim.id;
            const isLive = anim.id === 'live';
            return (
              <button
                key={anim.id}
                type="button"
                onClick={() => onSelectAnimation(anim.id)}
                title={anim.label}
                className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold transition-all lg:px-2.5 lg:py-2 lg:text-xs ${
                  active
                    ? isLive
                      ? 'bg-[#0648a6] text-white shadow-sm shadow-[#0648a6]/30'
                      : 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                    : idleBtn
                }`}
              >
                {isLive && <Sparkles className="h-3 w-3 lg:h-3.5 lg:w-3.5" />}
                <span>{anim.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
