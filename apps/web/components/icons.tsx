import type { SVGProps } from 'react';

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const SearchIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
export const BagIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>;
export const UserIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
export const MenuIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
export const CloseIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>;
export const HeartIcon = ({ filled, ...p }: SVGProps<SVGSVGElement> & { filled?: boolean }) => (
  <svg {...base(p)} fill={filled ? 'currentColor' : 'none'}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
);
export const PinIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11Z" /><circle cx="12" cy="10" r="2" /></svg>;
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="m5 12 4 4 10-10" /></svg>;
export const TruckIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>;
export const SealIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><circle cx="12" cy="10" r="6" /><path d="m9 15-1 6 4-2 4 2-1-6" /></svg>;
export const LeafIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15" /><path d="M5 19 13 11" /></svg>;
export const ChatIcon = (p: SVGProps<SVGSVGElement>) => <svg {...base(p)}><path d="M4 18V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 4Z" /></svg>;
export const WhatsAppIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden {...p}>
    <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2a2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" />
  </svg>
);
export const IconFor = ({ name, ...p }: { name: string } & SVGProps<SVGSVGElement>) => {
  const C = { farm: LeafIcon, certificate: SealIcon, truck: TruckIcon, chat: ChatIcon }[name] ?? CheckIcon;
  return <C {...p} />;
};
