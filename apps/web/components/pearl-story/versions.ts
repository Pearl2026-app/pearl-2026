// Three ways of telling the same story in the 3D pearl farm (owner, 10 Nov): the camera's path and the moments
// (a net lifted, the oyster floated to the surface, opened, the pearl rising and settling into the ring), by scroll
// progress 0 → 1. The words are short and general: they describe pearl farming, not claims about any one farm.

export type V3 = [number, number, number];
export interface CamKey {
  p: number;
  pos: V3;
  look: V3;
}
export type Span = [number, number];
export interface StoryLine {
  at: Span;
  eyebrow?: string;
  first: string;
  second?: string;
  /** a small line under the words (the picture's "Pearl jewellery in gold") */
  foot?: string;
}
export interface StoryVersion {
  slug: string;
  name: string;
  summary: string;
  cam: CamKey[];
  /** under the water at the start (the "One Pearl" opening) */
  startDark?: boolean;
  lift: Span; // the hero net rises to the surface
  float: Span; // the hero oyster leaves the net and floats on the surface
  open: Span; // it opens on its hinge
  rise: Span; // the pearl rises out of it
  land: Span; // the pearl moves to its place in the ring
  ring: Span; // the ring appears around it
  turn: Span; // the ring turns 360°
  dark: Span; // the scene darkens for the card
  lines: StoryLine[];
  /** which shell holds the pearl: an oyster from the farm's nets (default) or a pink scallop on open water */
  hero?: 'oyster' | 'scallop';
  /** the scallop story: the pearl slips into the water and sinks, glowing, as the camera follows */
  sink?: Span;
  /** a still shown while the 3D loads, and to visitors who prefer reduced motion */
  poster?: string;
  /** when the ring's title and then the card show */
  title: Span;
  card: Span;
}

/** Where things are in the farm (metres): rows of floats along −z, the hero line and net, the boat. */
export const FARM = {
  rows: [-4.2, -2.4, -0.6, 1.2, 3.0, 4.8, 6.6, 8.4],
  buoyStart: -8, // open water in front of the farm, where the oyster comes up to open
  buoyStep: 1.7,
  hangerRows: [2, 3, 4],
  hangerEvery: 3,
  hangersPerRow: 9,
  hero: { row: 3, buoy: 1 }, // x 1.2, z −9.7
  panelDepths: [-1.3, -2.5],
  boat: { x: -2.3, z: -7.2, yaw: 0.5 },
  float: { x: 0.85, z: -6.2 }, // where the oyster floats to open (right of the words)
};

const tail = (from: number): CamKey[] => [
  { p: from, pos: [0.2, 0.6, -6.0], look: [0.9, 0.05, -8.2] },
  { p: from + 0.08, pos: [0.38, 0.33, -5.3], look: [0.6, 0.03, -6.2] },
  { p: from + 0.18, pos: [0.48, 0.3, -5.42], look: [0.6, 0.14, -6.2] },
  { p: 1, pos: [0.5, 0.31, -5.45], look: [0.6, 0.16, -6.2] },
];

export const VERSIONS: StoryVersion[] = [
  {
    slug: 'the-farm',
    name: 'The Farm',
    summary: 'Over the rows at sunrise, under the water to the nets, a net lifted into the light, an oyster opened, the pearl set in the ring.',
    cam: [
      { p: 0, pos: [-3.6, 1.5, 4], look: [2, 0.2, -20] },
      { p: 0.12, pos: [-1.6, 0.95, -1], look: [2, 0, -18] },
      { p: 0.24, pos: [0.3, 0.45, -5.4], look: [1.2, -0.6, -12] },
      { p: 0.31, pos: [0.55, -0.45, -6.6], look: [1.2, -1.3, -11] },
      { p: 0.42, pos: [0.2, -1.6, -7.7], look: [1.2, -1.6, -10] },
      { p: 0.51, pos: [0.4, -0.9, -7.9], look: [1.2, -0.5, -9.8] },
      ...tail(0.58),
    ],
    lift: [0.43, 0.56],
    float: [0.56, 0.64],
    open: [0.64, 0.72],
    rise: [0.7, 0.78],
    land: [0.78, 0.86],
    ring: [0.8, 0.88],
    turn: [0.82, 1],
    dark: [0.9, 0.98],
    lines: [
      { at: [0, 0.1], eyebrow: 'Sahyadri Pearls', first: 'Where a pearl', second: 'begins.' },
      { at: [0.13, 0.24], first: 'Quiet water,', second: 'patient rows.' },
      { at: [0.32, 0.43], first: 'Beneath the surface,', second: 'the oysters grow.' },
      { at: [0.47, 0.56], first: 'Lifted into the light,', second: 'when the time is right.' },
      { at: [0.64, 0.77], first: 'Opened with care,', second: 'one pearl at a time.' },
    ],
    title: [0.8, 0.9],
    card: [0.9, 1.01],
  },
  {
    slug: 'one-pearl',
    name: 'One Pearl',
    summary: 'Close on one oyster in the deep, up into the sunrise as its net is lifted, the pearl revealed, then the whole farm, then the ring.',
    startDark: true,
    cam: [
      { p: 0, pos: [0.72, -1.5, -8.45], look: [1.1, -1.72, -9.65] },
      { p: 0.14, pos: [0.45, -1.32, -8.2], look: [1.1, -1.6, -9.65] },
      { p: 0.3, pos: [0.6, 0.5, -7.6], look: [1.2, 0.15, -9.8] },
      { p: 0.38, pos: [0.38, 0.33, -5.3], look: [0.6, 0.03, -6.2] },
      { p: 0.5, pos: [0.48, 0.3, -5.42], look: [0.6, 0.14, -6.2] },
      { p: 0.68, pos: [-3.2, 2.3, 3], look: [2, 0.2, -18] },
      { p: 0.8, pos: [0.42, 0.42, -5.2], look: [0.6, 0.3, -6.2] },
      { p: 1, pos: [0.44, 0.42, -5.24], look: [0.6, 0.31, -6.2] },
    ],
    lift: [0.16, 0.3],
    float: [0.3, 0.38],
    open: [0.38, 0.46],
    rise: [0.44, 0.52],
    land: [0.78, 0.86],
    ring: [0.8, 0.88],
    turn: [0.82, 1],
    dark: [0.9, 0.98],
    lines: [
      { at: [0, 0.12], eyebrow: 'Sahyadri Pearls', first: 'One pearl,', second: 'grown in quiet water.' },
      { at: [0.18, 0.3], first: 'Lifted into', second: 'the light.' },
      { at: [0.38, 0.5], first: 'Opened', second: 'with care.' },
      { at: [0.56, 0.72], first: 'From the farm,', second: 'to you.' },
    ],
    title: [0.8, 0.9],
    card: [0.9, 1.01],
  },
  {
    slug: 'from-above',
    name: 'From Above',
    summary: 'The farm seen from the air at sunrise, a slow spiral down into one row, under the water, the net lifted, the oyster opened, the ring.',
    cam: [
      { p: 0, pos: [2.6, 30, -13], look: [2.2, 0, -16] },
      { p: 0.15, pos: [0.4, 14, -6], look: [1.6, 0, -13] },
      { p: 0.3, pos: [-0.6, 3.2, -4.4], look: [1.2, 0, -9.6] },
      { p: 0.38, pos: [0.5, 0.42, -6.1], look: [1.2, -0.8, -10] },
      { p: 0.45, pos: [0.35, -1.25, -7.8], look: [1.2, -1.4, -9.9] },
      { p: 0.52, pos: [0.4, -0.9, -7.9], look: [1.2, -0.5, -9.8] },
      ...tail(0.58),
    ],
    lift: [0.46, 0.57],
    float: [0.57, 0.65],
    open: [0.65, 0.73],
    rise: [0.71, 0.79],
    land: [0.79, 0.86],
    ring: [0.81, 0.88],
    turn: [0.83, 1],
    dark: [0.9, 0.98],
    lines: [
      { at: [0, 0.12], eyebrow: 'Sahyadri Pearls', first: 'Rows on', second: 'still water.' },
      { at: [0.17, 0.3], first: 'Every float,', second: 'a line of oysters below.' },
      { at: [0.47, 0.57], first: 'Lifted into', second: 'the light.' },
      { at: [0.66, 0.78], first: 'Opened with care,', second: 'one pearl at a time.' },
    ],
    title: [0.81, 0.9],
    card: [0.9, 1.01],
  },
];

/** Where the scallop floats, in open water to the west of the farm (the farm far off on the horizon). */
export const SHELL_AT: V3 = [-30, 0, 10];
const S = (x: number, y: number, z: number): V3 => [SHELL_AT[0] + x, y, SHELL_AT[2] + z];

/**
 * Shell & Sea: the home page's opening, after the owner's reference video. It starts as the owner's picture, in 3D: an open
 * pink scallop with its pearl on clear shallow water, light moving on the sand; the pearl rises out of it; the view lowers
 * to the horizon; the pearl slips into the water and the camera follows it under, into rays and bubbles; the pearl
 * settles into the Filigree Crown ring, which turns; then the glass card.
 */
export const SHELL_STORY: StoryVersion = {
  slug: 'shell-and-sea',
  name: 'Shell & Sea',
  summary: 'A pink scallop on clear water opens on its pearl; the view lowers to the horizon and dives under the surface, where the pearl settles into the ring.',
  hero: 'scallop',
  poster: '/pearl-film/photo.webp',
  cam: [
    // the owner's picture: looking down at about 45°, the open shell and its pearl on the right, open water on the left
    { p: 0, pos: S(-0.47, 0.46, 0.72), look: S(-0.22, 0.04, -0.02) },
    { p: 0.14, pos: S(-0.4, 0.45, 0.68), look: S(-0.15, 0.06, -0.02) },
    { p: 0.28, pos: S(-0.3, 0.54, 0.84), look: S(-0.08, 0.12, -0.02) },
    { p: 0.4, pos: S(0.22, 0.1, 0.95), look: S(0, 0.1, -2) },
    { p: 0.5, pos: S(0.16, -0.3, 0.85), look: S(0, -0.3, -1.4) },
    { p: 0.62, pos: S(0.1, -0.78, 0.9), look: S(0, -0.62, -0.8) },
    { p: 0.76, pos: S(0.08, -0.72, 0.62), look: S(0, -0.62, -0.6) },
    { p: 1, pos: S(0.08, -0.72, 0.6), look: S(0, -0.62, -0.6) },
  ],
  lift: [2, 3],
  float: [2, 3],
  open: [-0.2, -0.1], // open from the first frame, as in the picture
  rise: [0.14, 0.28],
  sink: [0.42, 0.6],
  land: [0.66, 0.76],
  ring: [0.68, 0.78],
  turn: [0.7, 1],
  dark: [0.88, 0.97],
  lines: [
    { at: [0, 0.09], eyebrow: 'Sahyadri Pearls', first: 'A pearl,', second: 'held close.', foot: 'Pearl jewellery in gold' },
    { at: [0.13, 0.28], eyebrow: 'The Signature Collection', first: 'Lustre,', second: 'made to be worn.' },
    { at: [0.33, 0.44], first: 'Calm as', second: 'still water.' },
  ],
  title: [0.7, 0.86],
  card: [0.88, 1.01],
};

export const versionBySlug = (slug: string) => [...VERSIONS, SHELL_STORY].find((v) => v.slug === slug);
