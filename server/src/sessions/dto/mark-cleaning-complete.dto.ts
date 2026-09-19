import { IsUUID } from 'class-validator';

export class MarkCleaningCompleteDto {
  @IsUUID()
  tableId!: string;
}
