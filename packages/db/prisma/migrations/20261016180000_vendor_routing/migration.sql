-- Orders go to the vendor nearest the delivery address; vendors assign their own delivery partners.
ALTER TABLE "Vendor" ADD COLUMN "pincode" TEXT;
ALTER TABLE "DeliveryPartner" ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DeliveryPartner" ADD COLUMN "vendorId" TEXT;
ALTER TABLE "Order" ADD COLUMN "fulfilmentVendorId" TEXT;

CREATE INDEX "Order_fulfilmentVendorId_idx" ON "Order"("fulfilmentVendorId");

ALTER TABLE "DeliveryPartner" ADD CONSTRAINT "DeliveryPartner_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_fulfilmentVendorId_fkey" FOREIGN KEY ("fulfilmentVendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
