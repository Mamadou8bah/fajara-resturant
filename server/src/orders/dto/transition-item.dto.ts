import { OrderItemStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class TransitionItemDto {
  @IsEnum(OrderItemStatus)
  status!: OrderItemStatus;
}
