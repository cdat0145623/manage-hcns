import React from "react";
import { t } from "@lingui/core/macro";
import { motion, useReducedMotion } from "framer-motion";

const CHARACTER_DURATION = 0.42;
const CHARACTER_DELAY = 0.045;
const PAUSE_AFTER_WAVE = 0.75;

export function AuthLoadingScreen(): JSX.Element {
  const message = t`Chuẩn bị không gian làm việc`;
  const reducedMotion = useReducedMotion();
  const animatedCharacterCount = [...message].filter(
    (character) => character !== " ",
  ).length;
  const lastCharacterDelay =
    Math.max(animatedCharacterCount - 1, 0) * CHARACTER_DELAY;
  const cycleDuration =
    lastCharacterDelay + CHARACTER_DURATION + PAUSE_AFTER_WAVE;

  let animatedCharacterIndex = 0;

  return (
    <main
      className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f8f7fc] px-6 text-[#25232d]"
      role="status"
      aria-live="polite"
    >
      <div className="absolute left-6 top-6 flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] text-[#3c3947]">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#6956d8] text-[11px] font-bold text-white">
          K
        </span>
        <span>
          kan<span className="text-[#6956d8]">.</span>
        </span>
      </div>

      <div className="flex flex-col items-center">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ebe8ff] text-lg font-bold text-[#6956d8] shadow-[0_10px_30px_rgba(105,86,216,0.12)]">
          K
        </div>
        {reducedMotion ? (
          <span className="text-center text-base font-medium tracking-[-0.01em] text-[#5b5865]">
            {message}
          </span>
        ) : (
          <>
            <span className="sr-only">{message}</span>
            <span aria-hidden="true" className="text-center text-base font-medium tracking-[-0.01em] text-[#5b5865]">
              {[...message].map((character, index) => {
                if (character === " ") {
                  return (
                    <span aria-hidden="true" className="inline-block w-1.5" key={index}>
                      {" "}
                    </span>
                  );
                }

                const delay = animatedCharacterIndex * CHARACTER_DELAY;
                const repeatDelay = Math.max(
                  cycleDuration - delay - CHARACTER_DURATION,
                  0,
                );
                animatedCharacterIndex += 1;

                return (
                  <motion.span
                    animate={{ y: [0, -6, 0] }}
                    className="inline-block"
                    key={index}
                    transition={{
                      duration: CHARACTER_DURATION,
                      delay,
                      ease: "easeInOut",
                      repeat: Infinity,
                      repeatDelay,
                    }}
                  >
                    {character}
                  </motion.span>
                );
              })}
            </span>
          </>
        )}
      </div>
    </main>
  );
}
