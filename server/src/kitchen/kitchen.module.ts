import { Module } from '@nestjs/common';
import { CommonServicesModule } from '../common/common-services.module';
import { OrdersModule } from '../orders/orders.module';
import { KitchenController } from './kitchen.controller';

@Module({
  imports: [OrdersModule, CommonServicesModule],
  controllers: [KitchenController],
})
export class KitchenModule {}
