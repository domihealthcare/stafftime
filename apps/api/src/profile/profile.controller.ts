import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Res,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { SetOwnPinDto, UpdateProfileDto, UploadPhotoDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.profiles.get(user.id);
  }

  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.profiles.update(user.id, dto);
  }

  @Put('pin')
  setPin(@CurrentUser() user: AuthUser, @Body() dto: SetOwnPinDto) {
    return this.profiles.setOwnPin(user.id, dto.currentPassword, dto.pin);
  }

  @Put('photo')
  setPhoto(@CurrentUser() user: AuthUser, @Body() dto: UploadPhotoDto) {
    return this.profiles.setPhoto(user.id, dto.image);
  }

  @Delete('photo')
  removePhoto(@CurrentUser() user: AuthUser) {
    return this.profiles.removePhoto(user.id, user.id);
  }

  /// An admin can take down somebody else's photo.
  @Delete('photo/:employeeId')
  @Roles(Role.ADMIN)
  removeSomebodysPhoto(
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.profiles.removePhoto(employeeId, user.id);
  }

  /// Anybody signed in may see a colleague's photo — it is in the Directory.
  /// The URL carries the photo's version, so it can be cached.
  @Get('photo/:employeeId')
  async photo(@Param('employeeId', ParseUUIDPipe) employeeId: string, @Res() response: Response) {
    const { bytes, contentType } = await this.profiles.photo(employeeId);
    response
      .setHeader('Content-Type', contentType)
      .setHeader('Content-Length', String(bytes.byteLength))
      .setHeader('Cache-Control', 'private, max-age=86400')
      .setHeader('X-Content-Type-Options', 'nosniff')
      .send(bytes);
  }
}
