import { IsUUID } from 'class-validator';

export class MoveSessionDto {
  @IsUUID()
  toTableId!: string;
}
