-- Manufacturer and farm logins, rider applications with documents, low-stock alerts, business buyers, area coupons.
-- Written to be safe to run again (the demo site retries a migration that was interrupted).
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANUFACTURER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FARMER';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "manufacturerId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "farmId" TEXT;
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "vehicleNumber" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "licenceNumber" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "licenceUrl" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "rcUrl" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "addressProofUrl" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "lowStockAt" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "b2bPricePaise" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "b2bMinQty" INTEGER;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "b2bOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "b2bStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "businessGstin" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "b2bAppliedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "b2bNote" TEXT;

ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "cityId" TEXT;
ALTER TABLE "Coupon" ADD COLUMN IF NOT EXISTS "vendorId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
