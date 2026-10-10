import type { ImageRef } from '@/lib/types';

/**
 * Responsive image from the API's pre-built WebP variants (400/800/1200/1600), lazy by default.
 * Width and height are always set so the layout does not shift while images load.
 */
export function PearlImage({
  image,
  sizes = '(min-width: 1024px) 25vw, 50vw',
  className,
  priority,
  alt,
  width = 800,
  height = 800,
  style,
}: {
  image: ImageRef | null | undefined;
  sizes?: string;
  className?: string;
  priority?: boolean;
  alt?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}) {
  if (!image) return <div className={`bg-surface-muted ${className ?? ''}`} style={{ aspectRatio: `${width}/${height}` }} aria-hidden />;
  const v = image.variants ?? null;
  const srcSet = v ? Object.entries(v).map(([w, u]) => `${u} ${w}w`).join(', ') : undefined;
  return (
    <img
      src={v?.['800'] ?? image.url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt ?? image.alt ?? ''}
      width={image.width ?? width}
      height={image.height ?? height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
      style={style}
    />
  );
}
