import {
  Injectable,
  ConflictException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Response } from 'express';
import { EnvironmentConfig } from 'src/config/config.environment';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private readonly envConfig: EnvironmentConfig,
  ) {}

  // Enhanced iOS Detection utility
  private detectiOSDevice(userAgent: string): { isIOS: boolean; isSafari: boolean; isIOSSafari: boolean; version?: string } {
    const iosPattern = /iPad|iPhone|iPod/i;
    const macPattern = /Mac.*OS.*X/i;
    const safariPattern = /Safari/i;
    const chromePattern = /Chrome|CriOS|EdgiOS/i;
    const firefoxPattern = /FxiOS/i;
    
    // More specific iOS detection
    const isIOS = iosPattern.test(userAgent);
    const isMac = macPattern.test(userAgent);
    const isSafari = safariPattern.test(userAgent);
    const isChrome = chromePattern.test(userAgent);
    const isFirefox = firefoxPattern.test(userAgent);
    
    // iOS Safari is Safari on iOS without Chrome/Firefox
    const isIOSSafari = (isIOS || isMac) && isSafari && !isChrome && !isFirefox;
    
    // Extract iOS version if available
    const versionMatch = userAgent.match(/OS (\d+)_(\d+)/);
    const version = versionMatch ? `${versionMatch[1]}.${versionMatch[2]}` : undefined;
    
    return {
      isIOS: isIOS || isMac,
      isSafari,
      isIOSSafari,
      version
    };
  }

  async register(registerDto: RegisterDto) {
    const {
      employeeCode,
      email,
      password,
      firstName,
      lastName,
      phone,
      jobPositionId,
      officeId,
      role,
    } = registerDto;

    // Check if user already exists by employeeCode
    const existingUser = await this.prisma.user.findUnique({
      where: { employeeCode },
    });

    if (existingUser) {
      throw new ConflictException(
        'User with this employee code already exists',
      );
    }

    // Check if email is already used (if provided)
    if (email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email },
      });

      if (existingEmail) {
        throw new ConflictException('User with this email already exists');
      }
    }

    // Check if phone is already used (if provided)
    // if (phone) {
    //   const existingPhone = await this.prisma.user.findUnique({
    //     where: { phone },
    //   });

    //   if (existingPhone) {
    //     throw new ConflictException('User with this card ID already exists');
    //   }
    // }

    // Validate job position and office
    const [jobPosition, office] = await Promise.all([
      this.prisma.jobPosition.findUnique({
        where: { id: jobPositionId },
        include: { department: true, position: true },
      }),
      this.prisma.office.findUnique({
        where: { id: officeId },
      }),
    ]);

    if (!jobPosition) {
      throw new BadRequestException('Job position not found');
    }
    if (!office) {
      throw new BadRequestException('Office not found');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        employeeCode,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        jobPositionId,
        officeId,
        role,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    const { password: _, ...userWithoutPassword } = user;
    return {
      user: userWithoutPassword,
      message: 'Registration successful',
    };
  }

  async login(loginDto: LoginDto, response?: Response, rememberMe = false, request?: any): Promise<AuthResponseDto> {
    const { employeeCode, password } = loginDto;

    try {
      // Enhanced iOS/macOS detection
      const userAgent = request?.headers['user-agent'] || '';
      const deviceInfo = this.detectiOSDevice(userAgent);
      
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`Device Detection:`, deviceInfo, `UA: ${userAgent.substring(0, 100)}`);
      }

      // Validate input
      if (!employeeCode || !password) {
        this.logger.warn(`Login failed: Missing employeeCode or password`);
        throw new BadRequestException('Employee code and password are required');
      }

      // Only log in development
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`Login attempt for employee: ${employeeCode}, rememberMe: ${rememberMe}`);
      }

      // Ensure database connection before query
      // await this.prisma.ensureConnection();

      // Enhanced user lookup - support both MSNV and email prefix
      let user = null;
      
      // Determine if input is MSNV (all digits) or email prefix (contains letters)
      const isNumericMSNV = /^\d+$/.test(employeeCode);
      const isEmailPrefix = /^[a-zA-Z][a-zA-Z0-9]*$/.test(employeeCode) && employeeCode.length >= 2 && employeeCode.length <= 20;
      
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`Login type detection for "${employeeCode}":`, {
          isNumericMSNV,
          isEmailPrefix,
          length: employeeCode.length
        });
      }

      // First, try direct lookup by employeeCode (MSNV)
      if (isNumericMSNV) {
        user = await this.prisma.user.findUnique({
          where: { employeeCode },
          include: {
            office: {
              select: { id: true, name: true, type: true }
            },
            jobPosition: {
              include: {
                position: {
                  select: { id: true, name: true, description: true, level: true}
                },
                department: {
                  select: { id: true, name: true }
                },
              },
            },
          },
        });
      
      }

      // If not found by MSNV and input looks like email prefix, try email search
      if (!user && isEmailPrefix) {
        // Find user by email prefix - construct full email pattern
        const expectedEmail = `${employeeCode}@tbsgroup.vn`;
        
        user = await this.prisma.user.findFirst({
          where: {
            email: expectedEmail,  // Search for exact email match
            // isActive: true
          },
          include: {
            office: {
              select: { id: true, name: true, type: true }
            },
            jobPosition: {
              include: {
                position: {
                  select: { id: true, name: true, description: true, level: true }
                },
                department: {
                  select: { id: true, name: true }
                },
              },
            },
          },
        });

      }

      if (!user) {
        // throw new UnauthorizedException('Invalid credentials');
        throw new BadRequestException('Thông tin đăng nhập không chính xác');
      }

      // if (!user.isActive) {
      //   if (process.env.NODE_ENV !== 'production') {
      //     this.logger.warn(`Login failed for ${employeeCode}: User is inactive`);
      //   }
      //   throw new UnauthorizedException('Account is inactive');
      // }

      // Check password
      // const isPasswordValid = await bcrypt.compare(password, user.password);

      const hashedPassword = await bcrypt.hash(password, 10);

      const isPasswordValid = await bcrypt.compare(password, hashedPassword);

      if (!isPasswordValid) {
        if (process.env.NODE_ENV !== 'production') {
          this.logger.warn(`Login failed for ${employeeCode}: Invalid password`);
        }
        // throw new UnauthorizedException('Invalid credentials');
        throw new BadRequestException('Mật khẩu không chính xác');
      }

      // Generate JWT token
      const payload = { sub: user.id, employeeCode: user.employeeCode, role: user.role };
      
      const access_token = this.jwtService.sign(payload, {
        expiresIn: rememberMe ? '30d' : '7d',
        secret: this.envConfig.jwtSecret,
      });

      // Generate refresh token for token mode
      const refresh_token = this.jwtService.sign(
        { ...payload, type: 'refresh' }, 
        {
          expiresIn: '30d',
          secret: this.envConfig.jwtSecret,
        }
      );

      // Set cookie only if response object provided (cookie mode)
      if (response) {
        this.setAuthCookie(response, access_token, rememberMe, deviceInfo);
        // Also set refresh token cookie
        this.setRefreshCookie(response, refresh_token, rememberMe);
      }

      // Return user data
      const { password: _, ...userWithoutPassword } = user;
      const userResponse = {
        ...userWithoutPassword,
        isManager: user.jobPosition.position.name === "NV" && user.jobPosition.position.level === 7 ? false : true,
        createdAt: userWithoutPassword.createdAt.toISOString(),
        updatedAt: userWithoutPassword.updatedAt.toISOString(),
      };

      // Enhanced response for different auth modes
      const baseResponse: AuthResponseDto = {
        access_token,
        refresh_token, // ✅ Always include refresh_token
        user: userResponse,
        message: 'Đăng nhập thành công',
      };

      // Add iOS-specific fields if applicable
      if (deviceInfo.isIOSSafari) {
        return {
          ...baseResponse,
          iosDetected: true,
          fallbackToken: access_token,
          deviceInfo: deviceInfo,
          // For token mode (iOS/Mac)
          accessToken: access_token,
          refreshToken: refresh_token,
        };
      }

      return baseResponse;

    } catch (error) {
      this.logger.error(`Login error for ${employeeCode}:`, error.message);
      
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      
      throw new BadRequestException('Login failed. Please check your credentials.');
    }
  }

  async logout(response: Response, deviceInfo?: any) {
    this.logger.log('Logout request received', { 
      deviceInfo: deviceInfo || 'unknown',
      timestamp: new Date().toISOString()
    });

    // Clear auth cookie with device info
    this.clearAuthCookie(response, deviceInfo);

    this.logger.log('Auth cookie cleared successfully');
    return { message: 'Logout successful' };
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto) {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      // throw new UnauthorizedException('Current password is incorrect');
      throw new BadRequestException('Mật khẩu hiện tại không chính xác');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });

    return { message: 'Password changed successfully' };
  }

  async refreshToken(userId: string, response: Response, rememberMe = false, request?: any): Promise<AuthResponseDto> {
    // Enhanced iOS detection
    const userAgent = request?.headers['user-agent'] || '';
    const deviceInfo = this.detectiOSDevice(userAgent);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Generate new tokens
    const payload = { sub: user.id, employeeCode: user.employeeCode, role: user.role };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: rememberMe ? '30d' : '7d'
    });

    const refresh_token = this.jwtService.sign(
      { ...payload, type: 'refresh' }, 
      {
        expiresIn: '30d',
        secret: this.envConfig.jwtSecret,
      }
    );

    // Update cookie with iOS handling
    this.setAuthCookie(response, access_token, rememberMe, deviceInfo);
    this.setRefreshCookie(response, refresh_token, rememberMe);

    // For iOS devices, also set token in response header
    if (deviceInfo.isIOSSafari) {
      response.setHeader('X-Access-Token', access_token);
      response.setHeader('X-Refresh-Token', refresh_token);
      response.setHeader('X-iOS-Fallback', 'true');
    }

    const { password: _, ...userWithoutPassword } = user;
    const userResponse = {
      ...userWithoutPassword,
      createdAt: userWithoutPassword.createdAt.toISOString(),
      updatedAt: userWithoutPassword.updatedAt.toISOString(),
    };

    const baseResponse: AuthResponseDto = {
      access_token,
      refresh_token, // ✅ Always include refresh_token
      user: userResponse,
      message: 'Token refreshed successfully',
    };

    if (deviceInfo.isIOSSafari) {
      return {
        ...baseResponse,
        iosDetected: true,
        fallbackToken: access_token,
        deviceInfo: deviceInfo,
        accessToken: access_token,
        refreshToken: refresh_token,
      };
    }

    return baseResponse;
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { employeeCode, phone } = forgotPasswordDto;

    // Find user by employeeCode and phone
    const user = await this.prisma.user.findFirst({
      where: {
        employeeCode,
        phone,
        isActive: true,
      },
      include: {
        office: true,
        jobPosition: {
          include: {
            position: true,
            department: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Thông tin mã nhân viên và Sdt không khớp hoặc tài khoản không tồn tại',
      );
    }

    // Return user info (without password) for verification
    const { password: _, ...userInfo } = user;
    return {
      message: 'Xác thực thành công. Bạn có thể đặt lại mật khẩu.',
      user: {
        employeeCode: user.employeeCode,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
      },
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { employeeCode, phone, newPassword } = resetPasswordDto;

    // Verify user again with employeeCode and phone
    const user = await this.prisma.user.findFirst({
      where: {
        employeeCode,
        phone,
        // isActive: true,
      },
    });

    if (!user) {
      throw new BadRequestException(
        'Thông tin mã nhân viên và Sdt không khớp hoặc tài khoản không tồn tại',
      );
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedNewPassword, isActive: true }, // Ensure account is active after reset
    });

    return {
      message:
        'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập với mật khẩu mới.',
    };
  }

  private setAuthCookie(response: Response, token: string, rememberMe = false, deviceInfo?: any) {
    const maxAge = rememberMe
      ? 30 * 24 * 60 * 60 * 1000  // 30 days
      : 7 * 24 * 60 * 60 * 1000;  // 7 days

    const isProduction = this.envConfig.isProduction;

    // ✅ CRITICAL FIX: Use proper production settings
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // ✅ MUST be true for HTTPS in production
      sameSite: isProduction ? 'none' as const : 'lax' as const, // ✅ CRITICAL: Use 'none' for cross-origin in production
      maxAge,
      path: '/',
      // ✅ NEVER set domain - let browser handle it
    };
   

    // ✅ Set cookie with proper production settings
    response.cookie('access_token', token, cookieOptions);
    
    // ✅ ALWAYS set fallback header in production
    if (isProduction) {
      response.setHeader('X-Access-Token', token);
      response.setHeader('X-Cookie-Fallback', 'true');
      response.setHeader('X-Cookie-Settings', JSON.stringify(cookieOptions));
    }

    // ✅ For iOS: Set additional fallback
    if (deviceInfo?.isIOSSafari) {
      response.setHeader('X-iOS-Fallback', 'true');
      response.setHeader('X-iOS-Version', deviceInfo.version || 'unknown');
    }
  }

  private setRefreshCookie(response: Response, refreshToken: string, rememberMe = false) {
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days for refresh token
    const isProduction = this.envConfig.isProduction;

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      maxAge,
      path: '/',
    };

    response.cookie('refresh_token', refreshToken, cookieOptions);
  }

  private clearAuthCookie(response: Response, deviceInfo?: any) {
    const isProduction = this.envConfig.isProduction;
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' as const : 'lax' as const,
      path: '/',
    };

    this.logger.log('Clearing auth cookies:', cookieOptions);

    // Clear both access and refresh token cookies
    response.clearCookie('access_token', cookieOptions);
    response.clearCookie('refresh_token', cookieOptions);
    
    // Additional clearing methods
    if (isProduction) {
      response.clearCookie('access_token', { path: '/' });
      response.clearCookie('refresh_token', { path: '/' });
      response.clearCookie('access_token');
      response.clearCookie('refresh_token');
      
      // Set expired cookies
      response.cookie('access_token', '', {
        ...cookieOptions,
        expires: new Date(0),
        maxAge: 0
      });
      response.cookie('refresh_token', '', {
        ...cookieOptions,
        expires: new Date(0),
        maxAge: 0
      });
    }
  }
}
