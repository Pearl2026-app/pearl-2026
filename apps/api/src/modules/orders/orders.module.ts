import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
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

@Module({
  imports: [AuthModule, EnquiriesModule],
  controllers: [CartController, CheckoutController, AccountController, AdminOrdersController, EnquiryConvertController, ReturnsController, CouponUsageController, CouponsController, AdminPaymentsController],
  providers: [StockService, PricingService, CartService, OrdersService, PaymentsService, InvoiceService, AfterDeliveryService],
  exports: [StockService, PricingService, OrdersService, PaymentsService, InvoiceService, CartService],
})
export class OrdersModule {}
