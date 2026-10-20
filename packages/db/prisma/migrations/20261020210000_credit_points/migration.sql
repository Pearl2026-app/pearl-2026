-- Credit points redeemed on an order. Safe to run again.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pointsPaise" INTEGER NOT NULL DEFAULT 0;
