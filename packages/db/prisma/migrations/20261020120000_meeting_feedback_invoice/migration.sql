-- Business buyers' GSTIN on orders, farm and carat snapshot on order lines, exclusive pieces.
ALTER TABLE "Order" ADD COLUMN "buyerGstin" TEXT, ADD COLUMN "buyerBusinessName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "farmName" TEXT, ADD COLUMN "caratWeight" DECIMAL(8,3);
ALTER TABLE "Product" ADD COLUMN "isExclusive" BOOLEAN NOT NULL DEFAULT false;
