import { limit } from '../config/config';
import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/context';
import { CurrentUser, Public } from '../common/decorators';
import { badRequest } from '../common/errors';
import { AuthService } from './auth.service';
import {
  ChallengeDto,
  CustomerOtpRequestDto,
  CustomerOtpVerifyDto,
  DeviceTokenDto,
  OtpVerifyDto,
  PartnerOtpRequestDto,
  RefreshDto,
  StaffLoginDto,
} from './auth.dto';
import { REFRESH_COOKIE, TokensService } from './tokens.service';

type Issued = { accessToken: string; refreshToken: string; user: unknown };

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { limit: limit(20), ttl: 60_000 } })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  /** Web clients get httpOnly cookies; apps get tokens in the body. */
  private respond(req: Request, res: Response, issued: Issued) {
    const client = String(req.headers['x-sp-client'] ?? '');
    if (client === 'web' || client === 'admin') {
      this.tokens.setCookies(res, issued);
      return { user: issued.user };
    }
    return issued;
  }

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(@Body() dto: CustomerOtpRequestDto) {
    return this.auth.requestCustomerOtp(dto.phone);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(@Body() dto: CustomerOtpVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.verifyCustomerOtp(dto));
  }

  @Public()
  @Post('partner/otp/request')
  @HttpCode(200)
  partnerRequest(@Body() dto: PartnerOtpRequestDto) {
    return this.auth.requestPartnerOtp(dto.identifier);
  }

  @Public()
  @Post('partner/otp/verify')
  @HttpCode(200)
  async partnerVerify(@Body() dto: OtpVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.verifyPartnerOtp(dto.challengeId, dto.code));
  }

  @Public()
  @Post('staff/login')
  @HttpCode(200)
  @Throttle({ default: { limit: limit(10), ttl: 60_000 } })
  staffLogin(@Body() dto: StaffLoginDto) {
    return this.auth.staffLogin(dto.email, dto.password);
  }

  @Public()
  @Post('staff/otp/email')
  @HttpCode(200)
  staffEmail(@Body() dto: ChallengeDto) {
    return this.auth.staffOtpByEmail(dto.challengeId);
  }

  @Public()
  @Post('staff/verify')
  @HttpCode(200)
  async staffVerify(@Body() dto: OtpVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.staffVerify(dto.challengeId, dto.code));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? (req as Request & { cookies?: Record<string, string> }).cookies?.[REFRESH_COOKIE];
    try {
      if (!token) throw badRequest('REFRESH_INVALID', 'Please sign in again.');
      return this.respond(req, res, await this.auth.refresh(token));
    } catch (e) {
      // A dead session clears its cookies, so the browser stops retrying.
      if (req.headers['x-sp-client']) this.tokens.clearCookies(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser | null, @Res({ passthrough: true }) res: Response) {
    if (user?.sessionId) await this.tokens.revoke(user.sessionId);
    this.tokens.clearCookies(res);
    return { ok: true };
  }

  @Post('device-token')
  @HttpCode(200)
  async deviceToken(@CurrentUser() user: AuthUser, @Body() dto: DeviceTokenDto) {
    await this.prisma.deviceToken.upsert({
      where: { token: dto.token },
      create: { ...dto, userId: user.id },
      update: { userId: user.id, isActive: true, lastSeenAt: new Date(), platform: dto.platform, appKind: dto.appKind },
    });
    return { ok: true };
  }
}

@ApiTags('auth')
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
