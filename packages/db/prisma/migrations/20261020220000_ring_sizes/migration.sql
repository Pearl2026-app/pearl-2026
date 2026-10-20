-- Ring sizes with stock per size. Safe to run again.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "sizes" JSONB;
ALTER TABLE "CartItem" ADD COLUMN IF NOT EXISTS "size" TEXT NOT NULL DEFAULT '';
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "size" TEXT;
ALTER TABLE "StockHold" ADD COLUMN IF NOT EXISTS "size" TEXT;
DROP INDEX IF EXISTS "CartItem_cartId_productId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CartItem_cartId_productId_size_key" ON "CartItem"("cartId", "productId", "size");
