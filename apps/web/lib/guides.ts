// Reference data for the Pearl Guide and the size guides on product pages.

/** Indian ring sizes: inside circumference in mm (≈ 40 + size). Diameter = circumference ÷ π. */
export const RING_SIZES = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24].map((size) => {
  const circumference = 40 + size;
  return { size, circumference, diameter: Math.round((circumference / Math.PI) * 10) / 10 };
});

export const NECKLACE_LENGTHS = [
  { name: 'Collar', cm: '30–33', inches: '12–13', sits: 'Wraps the middle of the neck. Best with open necklines.' },
  { name: 'Choker', cm: '35–40', inches: '14–16', sits: 'Rests at the base of the neck. The classic single strand.' },
  { name: 'Princess', cm: '43–48', inches: '17–19', sits: 'Falls just below the collarbone. Suits almost every outfit.' },
  { name: 'Matinee', cm: '50–60', inches: '20–24', sits: 'Rests at the top of the bust. Lovely over sarees and high necks.' },
  { name: 'Opera', cm: '70–86', inches: '28–34', sits: 'Long and elegant; can be doubled into a two-row choker.' },
  { name: 'Rope', cm: '100+', inches: '45+', sits: 'Wear it long, knotted, or wound two or three times.' },
];

/** How we grade. In-house grades: there is no single industry standard, so we say what each letter means. */
export const GRADES = [
  { grade: 'AAA', lustre: 'Very high, mirror-like reflections', surface: 'At least 95% clean', shape: 'Very round or very well matched' },
  { grade: 'AA+', lustre: 'High, sharp reflections', surface: 'At least 90% clean', shape: 'Round or near-round, well matched' },
  { grade: 'AA', lustre: 'High', surface: 'At least 80% clean; small marks', shape: 'Near-round, good matching' },
  { grade: 'A', lustre: 'Medium, softer glow', surface: 'Visible marks on part of the pearl', shape: 'Slightly off-round' },
];

export const PEARL_TYPES = [
  { name: 'Freshwater', from: 'Lakes and reservoirs, including the Sahyadri hills', size: '4–12 mm', look: 'Every colour from white to lavender; often all nacre, so very durable.' },
  { name: 'Akoya', from: 'Saltwater, mostly Japan and China', size: '6–9 mm', look: 'Very round with a bright, sharp lustre; the classic white strand.' },
  { name: 'South Sea', from: 'Saltwater, Australia, Indonesia, Philippines', size: '9–16 mm', look: 'Large, satin lustre, white to deep gold.' },
  { name: 'Tahitian', from: 'Saltwater, French Polynesia', size: '8–15 mm', look: 'Naturally dark: grey, green, aubergine and peacock.' },
];

/** Links from product specification rows to the guide. */
export const SPEC_GUIDE_ANCHOR: Record<string, string> = {
  Lustre: 'lustre',
  Surface: 'surface',
  Grade: 'grading',
  Size: 'size',
  Shape: 'shape',
  Certification: 'certificate',
};

/** Price bands in rupees for the menu and the Gifts page. */
export const PRICE_BANDS = [
  { label: 'Under ₹10,000', max: 10_000 },
  { label: '₹10,000 – ₹25,000', min: 10_000, max: 25_000 },
  { label: '₹25,000 – ₹50,000', min: 25_000, max: 50_000 },
  { label: 'Above ₹50,000', min: 50_000 },
] as const;
export const bandHref = (b: { min?: number; max?: number }) => `/jewellery?${[b.min != null && `price_min=${b.min}`, b.max != null && `price_max=${b.max}`].filter(Boolean).join('&')}`;

/** Which size guide a category gets on the product page. */
export const sizeGuideKind = (categorySlug: string): 'ring' | 'necklace' | null =>
  /ring/.test(categorySlug) ? 'ring' : /necklace|strand|pendant|mangalsutra|chain/.test(categorySlug) ? 'necklace' : null;
