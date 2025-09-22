import { PartialType } from '@nestjs/swagger';
import { CreateGatePassDto } from './create-gate-pass.dto';

export class UpdateGatePassDto extends PartialType(CreateGatePassDto) {}