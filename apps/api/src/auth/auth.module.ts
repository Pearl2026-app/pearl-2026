import { Module } from '@nestjs/common';
import { AuthController, MeController } from './auth.controller';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokensService } from './tokens.service';
import { UserLoader } from './user-loader.service';

@Module({
  controllers: [AuthController, MeController],
  providers: [AuthService, OtpService, TokensService, UserLoader],
  exports: [AuthService, OtpService, TokensService, UserLoader],
})
export class AuthModule {}
