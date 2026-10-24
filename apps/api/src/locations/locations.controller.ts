import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth/auth-user';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { Roles } from '../common/auth/roles.decorator';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { LocationsService } from './locations.service';
import { InvitesSyncInterceptor } from '../invites/invites-sync.interceptor';

/// Staff need an office's name, address and time zone. Its pin, geofence and
/// allowed addresses are what the clock-in check runs on, so they stay with
/// the admins who set them (the server does the check; the browser never needs
/// them).
export function forViewer<T extends object>(row: T, user: AuthUser): Partial<T> {
  if (user.role === Role.ADMIN) return row;
  const visible: Partial<T> = { ...row };
  for (const field of ADMIN_ONLY_FIELDS) delete visible[field as keyof T];
  return visible;
}

const ADMIN_ONLY_FIELDS = ['latitude', 'longitude', 'geofenceRadiusFeet', 'allowedIps'];

// A save here can change somebody's calendar invites.
@UseInterceptors(InvitesSyncInterceptor)
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    const rows = await this.locations.findAll(includeInactive ?? false);
    return rows.map((row) => forViewer(row, user));
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return forViewer(await this.locations.findOne(id), user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLocationDto) {
    return this.locations.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseUUIDPipe) id: string) {
    return this.locations.deactivate(id);
  }
}
