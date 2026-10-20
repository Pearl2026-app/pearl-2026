-- Manufacturer and farm logins, rider applications with documents, low-stock alerts, business buyers, area coupons.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANUFACTURER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'FARMER';

ALTER TABLE "User" ADD COLUMN "manufacturerId" TEXT, ADD COLUMN "farmId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeliveryPartner"
  ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "address" TEXT,
  ADD COLUMN "vehicleNumber" TEXT,
  ADD COLUMN "licenceNumber" TEXT,
  ADD COLUMN "licenceUrl" TEXT,
  ADD COLUMN "rcUrl" TEXT,
  ADD COLUMN "addressProofUrl" TEXT,
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "appliedAt" TIMESTAMP(3);

ALTER TABLE "Product"
  ADD COLUMN "lowStockAt" INTEGER,
  ADD COLUMN "b2bPricePaise" INTEGER,
  ADD COLUMN "b2bMinQty" INTEGER,
  ADD COLUMN "b2bOnly" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Customer"
  ADD COLUMN "b2bStatus" TEXT NOT NULL DEFAULT 'NONE',
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "businessGstin" TEXT,
  ADD COLUMN "b2bAppliedAt" TIMESTAMP(3),
  ADD COLUMN "b2bNote" TEXT;

ALTER TABLE "Coupon" ADD COLUMN "cityId" TEXT, ADD COLUMN "vendorId" TEXT;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;
