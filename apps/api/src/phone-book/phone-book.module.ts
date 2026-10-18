import { Module } from '@nestjs/common';
import { PhoneBookController } from './phone-book.controller';
import { PhoneBookService } from './phone-book.service';

@Module({
  controllers: [PhoneBookController],
  providers: [PhoneBookService],
})
export class PhoneBookModule {}
