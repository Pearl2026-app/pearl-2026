import { describe, expect, it } from 'vitest';
import { b2bPriceFrom, commissionSplit, metalRateKeyFor, metalRatePrice } from '../src';

describe('metalRatePrice', () => {
  it('prices weight × rate with a % margin, making and pearl, rounded up to ₹10', () => {
    // 4.25 g of 22K at ₹6,500/g = ₹27,625; +10% = ₹2,762.50; making ₹1,500; pearl ₹3,000 → ₹34,887.50 → ₹34,890
    const r = metalRatePrice({ weightGrams: 4.25, ratePerGramPaise: 650_000, margin: { percent: 10 }, makingPaise: 150_000, pearlPaise: 300_000 });
    expect(r.metalValuePaise).toBe(2_762_500);
    expect(r.marginPaise).toBe(276_250);
    expect(r.pricePaise).toBe(3_489_000);
    expect(r.pricePaise % 1000).toBe(0);
  });

  it('adds a fixed ₹ per gram margin', () => {
    // 10 g silver at ₹95/g = ₹950, + ₹20/g = ₹200 → ₹1,150
    const r = metalRatePrice({ weightGrams: 10, ratePerGramPaise: 9_500, margin: { perGramPaise: 2_000 } });
    expect(r.pricePaise).toBe(115_000);
  });

  it('refuses a missing weight or rate', () => {
    expect(() => metalRatePrice({ weightGrams: 0, ratePerGramPaise: 100 })).toThrow();
    expect(() => metalRatePrice({ weightGrams: 1, ratePerGramPaise: 0 })).toThrow();
  });
});

describe('metalRateKeyFor', () => {
  it('reads the rate to follow from the metal text', () => {
    expect(metalRateKeyFor('92.5 Silver')).toBe('SILVER_925');
    expect(metalRateKeyFor('92.5 silver, rhodium plated')).toBe('SILVER_925');
    expect(metalRateKeyFor('22K Gold')).toBe('GOLD_22K');
    expect(metalRateKeyFor('18k gold')).toBe('GOLD_18K');
    expect(metalRateKeyFor('14K Gold')).toBe('GOLD_14K');
    expect(metalRateKeyFor('Platinum')).toBeNull();
    expect(metalRateKeyFor('Brass')).toBeNull();
    expect(metalRateKeyFor(null)).toBeNull();
  });
});

describe('b2bPriceFrom', () => {
  it('takes the business discount off and rounds to the rupee', () => {
    expect(b2bPriceFrom(3_489_000, 10)).toBe(3_140_100);
  });
});

describe('commissionSplit', () => {
  it('splits the pearl value 50/30/20 and gives the metal and making to the trader', () => {
    const s = commissionSplit({ saleValuePaise: 1_000_000, metalPaise: 300_000, makingPaise: 100_000, farmerPercent: 50, traderPercent: 30, partnerPercent: 20 });
    expect(s.pearlValuePaise).toBe(600_000);
    expect(s.farmerPaise).toBe(300_000);
    expect(s.traderPearlPaise).toBe(180_000);
    expect(s.partnerPaise).toBe(120_000);
    expect(s.traderTotalPaise).toBe(580_000);
    expect(s.farmerPaise + s.traderTotalPaise + s.partnerPaise).toBe(1_000_000);
  });

  it('treats the whole sale as pearl value when there is no cost breakdown', () => {
    const s = commissionSplit({ saleValuePaise: 333_333, metalPaise: 0, makingPaise: 0, farmerPercent: 50, traderPercent: 30, partnerPercent: 20 });
    expect(s.pearlValuePaise).toBe(333_333);
    expect(s.farmerPaise + s.traderPearlPaise + s.partnerPaise).toBe(333_333);
  });

  it('never lets metal and making exceed the sale', () => {
    const s = commissionSplit({ saleValuePaise: 100_000, metalPaise: 80_000, makingPaise: 50_000, farmerPercent: 50, traderPercent: 30, partnerPercent: 20 });
    expect(s.metalValuePaise).toBe(80_000);
    expect(s.makingPaise).toBe(20_000);
    expect(s.pearlValuePaise).toBe(0);
  });
});
