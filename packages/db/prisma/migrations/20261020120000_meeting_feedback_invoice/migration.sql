-- Business buyers' GSTIN on orders, farm and carat snapshot on order lines, exclusive pieces.
-- Written to be safe to run again (the demo site retries a migration that was interrupted).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerGstin" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerBusinessName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "farmName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "caratWeight" DECIMAL(8,3);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "isExclusive" BOOLEAN NOT NULL DEFAULT false;
