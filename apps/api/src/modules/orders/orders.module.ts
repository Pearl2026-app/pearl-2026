import { BusinessAccountController, BusinessBuyersAdminController } from './business';
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { AbandonedCartsController, AbandonedCartService } from './abandoned-carts';
import { EnquiriesModule } from '../enquiries/enquiries.module';
import { AccountController } from './account.controller';
import { AdminOrdersController, EnquiryConvertController } from './admin-orders.controller';
import { CartService } from './cart.service';
import { CartController, CheckoutController } from './checkout.controller';
import { InvoiceService } from './invoice.service';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { PricingService } from './pricing.service';
import { AdminPaymentsController, AfterDeliveryService, CouponsController, CouponUsageController, ReturnsController } from './returns-coupons.controller';
import { StockService } from './stock.service';
import { WalletAccountController, WalletAdminController, WalletService } from './wallet';

@Module({
  imports: [AuthModule, EnquiriesModule],
  controllers: [CartController, CheckoutController, BusinessAccountController, BusinessBuyersAdminController, AccountController, AdminOrdersController, EnquiryConvertController, ReturnsController, CouponUsageController, CouponsController, AdminPaymentsController, AbandonedCartsController, WalletAccountController, WalletAdminController],
  providers: [StockService, PricingService, CartService, OrdersService, PaymentsService, InvoiceService, AfterDeliveryService, AbandonedCartService, WalletService],
  exports: [StockService, PricingService, OrdersService, PaymentsService, InvoiceService, CartService, WalletService],
})
export class OrdersModule {}
