import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({ example: 'john@example.com' })
  @Transform(({ value }: { value: string }) => value.toLowerCase().trim())
  @IsEmail(
    { allow_ip_domain: false, require_tld: true },
    { message: 'Please provide a valid email address' },
  )
  @Matches(/^[^@]+@[^@]+\.[a-zA-Z]{2,}$/, {
    message: 'Email must have a valid domain with at least 2-character TLD',
  })
  email: string;

  @ApiProperty({ example: '482910' })
  @IsString()
  @Length(6, 6)
  code: string;
}
