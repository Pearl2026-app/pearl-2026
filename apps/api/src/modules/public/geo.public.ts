import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators';
import { badRequest } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { nearestVendor, pincodePlace } from '../orders/routing';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Where the shopper is, so the store can show what their nearest store sells (like Zepto or Blinkit): from the PIN
 * code they type, or, before they type one, from the city their internet connection reports (Vercel adds it).
 */
@ApiTags('content (public)')
@Controller('geo')
export class GeoController {
  constructor(private readonly prisma: PrismaService) {}

  private async cities() {
    return this.prisma.city.findMany({ where: { isActive: true }, select: { id: true, name: true, slug: true, state: true }, orderBy: { sortOrder: 'asc' } });
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('pincode/:pin')
  async pincode(@Param('pin') pin: string) {
    const code = pin.replace(/\D/g, '');
    if (code.length !== 6) throw badRequest('INVALID_PIN', 'Enter a 6-digit PIN code.');
    const place = pincodePlace(code);
    if (!place) throw badRequest('UNKNOWN_PIN', 'We could not find that PIN code. Please check it.');
    const cities = await this.cities();
    // 1. A city whose name matches the district (Pune, Mumbai, Gurugram …).
    let city =
      cities.find((c) => norm(place.district).includes(norm(c.name)) || norm(c.name).includes(norm(place.district))) ?? null;
    // 2. Otherwise the city served by the nearest active store.
    const store = await nearestVendor(this.prisma, code, null);
    if (!city && store) {
      const served = await this.prisma.vendorCity.findMany({ where: { vendorId: store.id }, select: { cityId: true } });
      city = cities.find((c) => served.some((s) => s.cityId === c.id)) ?? null;
    }
    // 3. Otherwise a city in the same state, then "Rest of India".
    city ??= cities.find((c) => norm(c.state) === norm(place.state) && c.slug !== 'rest-of-india') ?? cities.find((c) => c.slug === 'rest-of-india') ?? null;
    return {
      pincode: code,
      district: place.district,
      state: place.state,
      city: city ? { slug: city.slug, name: city.name } : null,
      nearestStore: store ? { name: store.name, km: store.km != null ? Math.round(store.km) : null } : null,
    };
  }

  /** The city the visitor's connection reports, matched to one of our cities; null when unknown or not served. */
  @Public()
  @Get('ip-city')
  async ipCity(@Headers('x-vercel-ip-city') ipCity?: string, @Headers('x-vercel-ip-country-region') region?: string) {
    if (!ipCity) return { city: null };
    const name = norm(decodeURIComponent(ipCity));
    const aliases: Record<string, string> = { bangalore: 'bengaluru', bombay: 'mumbai', gurgaon: 'gurugram', newdelhi: 'delhi', poona: 'pune' };
    const want = aliases[name] ?? name;
    const city = (await this.cities()).find((c) => norm(c.name).includes(want) || want.includes(norm(c.name)));
    return { city: city ? { slug: city.slug, name: city.name } : null, region: region ?? null };
  }
}
