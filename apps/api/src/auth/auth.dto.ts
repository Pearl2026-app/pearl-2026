import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { email, indianMobile, otpCode, phoneE164 } from '@sahyadri/shared';

export class CustomerOtpRequestDto extends createZodDto(z.object({ phone: indianMobile })) {}
export class CustomerOtpVerifyDto extends createZodDto(
  z.object({
    challengeId: z.string().min(5).max(64),
    code: otpCode,
    name: z.string().trim().min(1).max(120).optional(),
    email: email.optional(),
    referralCode: z.string().trim().max(20).optional(),
  }),
) {}
export class PartnerOtpRequestDto extends createZodDto(z.object({ identifier: z.union([email, phoneE164]) })) {}
export class OtpVerifyDto extends createZodDto(z.object({ challengeId: z.string().min(5).max(64), code: otpCode })) {}
export class StaffLoginDto extends createZodDto(z.object({ email, password: z.string().min(1).max(200) })) {}
export class ChallengeDto extends createZodDto(z.object({ challengeId: z.string().min(5).max(64) })) {}
export class RefreshDto extends createZodDto(z.object({ refreshToken: z.string().min(10).max(200).optional() })) {}
export class DeviceTokenDto extends createZodDto(
  z.object({ token: z.string().min(10).max(4096), platform: z.enum(['ANDROID', 'IOS', 'WEB']), appKind: z.enum(['customer', 'delivery']) }),
) {}
