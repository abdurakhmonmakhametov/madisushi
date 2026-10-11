"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";

const AUTOPLAY_MS = 6000;

/**
 * Home hero banner carousel. Slides are server-rendered children laid out in a
 * horizontal scroll-snap track, so touch swipe is native; dots, arrow keys and
 * autoplay just scroll the track. Autoplay pauses on mouse hover, keyboard
 * focus and while a finger is down, when the tab is hidden, and for users who
 * prefer reduced motion.
 */
export function HeroCarousel({ children, labels }: { children: ReactNode; labels: { region: string; slide: string } }) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el || count === 0) return;
      const next = (i + count) % count;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollTo({ left: next * el.clientWidth, behavior: reduce ? "auto" : "smooth" });
    },
    [count],
  );

  // The scroll position is the source of truth (covers swipes too).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Restarting the timer on every slide change gives each slide its full time.
  useEffect(() => {
    if (count < 2 || paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => {
      if (!document.hidden) go(active + 1);
    }, AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [active, paused, count, go]);

  if (count === 0) return null;
  const many = count > 1;

  return (
    <div
      className="relative"
      role="region"
      aria-roledescription="carousel"
      aria-label={labels.region}
      // Phones fire a compat mouseenter on tap but no mouseleave, so hover means a real mouse only.
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setPaused(false)}
      // Keyboard focus pauses; a tapped/clicked button keeps focus, so only :focus-visible counts.
      onFocus={(e) => e.target.matches(":focus-visible") && setPaused(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") go(active - 1);
        if (e.key === "ArrowRight") go(active + 1);
      }}
    >
      <div ref={track} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {slides.map((s, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`${labels.slide} ${i + 1} / ${count}`}
            aria-hidden={i !== active}
            inert={i !== active}
            className="w-full shrink-0 snap-center snap-always"
          >
            {s}
          </div>
        ))}
      </div>

      {many && (
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:bottom-4">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`${labels.slide} ${i + 1}`}
              aria-current={i === active}
              className="grid h-6 place-items-center px-0.5"
            >
              <span className={clsx("block h-1.5 rounded-full transition-all duration-300", i === active ? "w-6 bg-brand" : "w-1.5 bg-white/60 shadow-[0_0_2px_rgba(0,0,0,.5)] hover:bg-white/90")} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
