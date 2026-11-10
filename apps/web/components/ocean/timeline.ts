// The opening scene's scroll timeline (owner's brief, 10 Nov): one GSAP timeline, scrubbed by ScrollTrigger across the
// pinned section, drives every value the 3D scene and the words read. Each value runs 0 → 1 with its own easing, so
// the camera, the shell, the pearl and the text move together without sudden changes.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

export interface OceanState {
  progress: number; // raw scroll progress, 0 → 1
  light: number; // Scene 1: from dark into the sea's light
  approach: number; // Scene 1: the camera drifts in
  orbit: number; // Scene 2: the camera moves around the shell
  open: number; // Scene 2: the shell opens on the pearl
  rise: number; // Scene 3: the pearl rises out of the shell
  part: number; // Scene 3: the halves of the shell part
  horizon: number; // Scene 3: the view lowers to the surface
  dive: number; // Scene 3 → 4: under the water
  bright: number; // Scene 4: the water brightens
  settle: number; // Scene 4: the Filigree Crown setting appears around the pearl
  forward: number; // Scene 4: the ring comes towards the camera
  turn: number; // Scene 4 → 5: the ring turns 360° (linear)
  dark: number; // Scene 5: the water darkens for the call to action
  exit: number; // Scene 5: hand-over to the next section
}

export const createOceanState = (): OceanState => ({
  progress: 0,
  light: 0,
  approach: 0,
  orbit: 0,
  open: 0,
  rise: 0,
  part: 0,
  horizon: 0,
  dive: 0,
  bright: 0,
  settle: 0,
  forward: 0,
  turn: 0,
  dark: 0,
  exit: 0,
});

/** The chapters of the words (by scroll progress): intro, reveal, transformation, showcase, call to action. */
export const CHAPTERS = [
  [0.0, 0.12],
  [0.14, 0.3],
  [0.41, 0.5],
  [0.6, 0.8],
  [0.84, 1.01],
] as const;
export const chapterAt = (p: number) => CHAPTERS.findIndex(([a, b]) => p >= a && p < b);

/**
 * Builds the timeline on `trigger` (the tall section). Units are hundredths of the scroll. `scrub: 1` smooths the
 * scroll into the animation over ~1 s, so a flick of the wheel glides rather than jumps.
 */
export function createOceanTimeline(trigger: HTMLElement, s: OceanState, onUpdate: (progress: number) => void) {
  gsap.registerPlugin(ScrollTrigger);
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: {
      trigger,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1,
      onUpdate: (st) => {
        s.progress = st.progress;
        onUpdate(st.progress);
      },
    },
  });
  const at = (prop: keyof OceanState, start: number, end: number, ease = 'power2.inOut') => tl.to(s, { [prop]: 1, duration: end - start, ease }, start);
  at('light', 0, 8, 'power2.out');
  at('approach', 0, 16, 'sine.inOut');
  at('orbit', 8, 32, 'sine.inOut');
  at('open', 10, 24, 'power3.inOut');
  at('rise', 20, 32);
  at('part', 28, 38);
  at('horizon', 34, 48);
  at('dive', 48, 60, 'power3.inOut');
  at('bright', 54, 66, 'sine.inOut');
  at('settle', 60, 68);
  at('forward', 64, 76, 'power2.out');
  at('turn', 68, 94, 'none');
  at('dark', 82, 94, 'sine.inOut');
  at('exit', 94, 100, 'power1.in');
  return tl;
}

/** Keeps ScrollTrigger in step with the site's smooth scrolling (Lenis), when it is running. */
export function syncWithLenis() {
  const lenis = (window as unknown as { __lenis?: { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void } }).__lenis;
  if (!lenis) return () => {};
  const update = () => ScrollTrigger.update();
  lenis.on('scroll', update);
  return () => lenis.off('scroll', update);
}
