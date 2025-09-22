import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
  Query,
  Patch,
  Req,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthResponseDto } from './dto/auth-response.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Login user with dual auth support' })
  @ApiQuery({ name: 'mode', required: false, description: 'Auth mode: token for iOS/Mac, cookie for others' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: any,
    @Query('mode') mode?: string, // ✅ Move optional parameter to the end
  ): Promise<AuthResponseDto> {
    try {
      // Detect auth mode
      const authMode = mode || request.headers['x-auth-mode']
      const isTokenMode = authMode === 'token'
      
      // Enhanced device detection
      const userAgent = request?.headers['user-agent'] || ''
      const isIOSOrMac = /iPad|iPhone|iPod|Macintosh/i.test(userAgent)
      
      this.logger.log('Login request:', {
        authMode: isTokenMode ? 'token' : 'cookie',
        isIOSOrMac,
        userAgent: userAgent.substring(0, 50)
      })

      const result = await this.authService.login(
        loginDto, 
        isTokenMode ? null : response, // Don't pass response for token mode
        loginDto.rememberMe || false, 
        request
      )

      // Token mode: Return tokens in response body and headers
      if (isTokenMode) {
        response.setHeader('X-Access-Token', result.access_token)
        response.setHeader('X-Refresh-Token', result.refresh_token || result.access_token)
        
        return {
          ...result,
          accessToken: result.access_token,
          refreshToken: result.refresh_token || result.access_token,
        }
      }

      // Cookie mode: Tokens are set in cookies by service
      return result
    } catch (error) {
      console.error('Login controller error:', error)
      throw error
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'User logged out successfully' })
  async logout(@Res({ passthrough: true }) response: Response, @Req() request: any) {
    // ✅ Pass request to get device info for proper cookie clearing
    const userAgent = request?.headers['user-agent'] || '';
    const deviceInfo = {
      isIOSSafari: /iPad|iPhone|iPod|Mac.*OS.*X/i.test(userAgent) && 
                   /Safari/i.test(userAgent) && 
                   !/Chrome|CriOS|EdgiOS/i.test(userAgent)
    };
    
    return this.authService.logout(response, deviceInfo);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() req: any,
  ) {
    return this.authService.changePassword(req.user.id, changePasswordDto);
  }

  @Post('refresh')
  @Public() // Allow unauthenticated refresh attempts
  @ApiOperation({ summary: 'Refresh access token with dual auth support' })
  async refreshToken(
    @Req() request: any,
    @Res({ passthrough: true }) response: Response,
    @Body() body: { refreshToken?: string } = {}, // ✅ Provide default value
  ): Promise<AuthResponseDto> {
    try {
      const authMode = request.headers['x-auth-mode']
      const isTokenMode = authMode === 'token'
      
      if (isTokenMode) {
        // Token mode: Get refresh token from body
        if (!body.refreshToken) {
          throw new BadRequestException('Refresh token required')
        }
        
        // Validate refresh token and get user
        const payload = this.jwtService.verify(body.refreshToken)
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          include: {
            office: true,
            jobPosition: {
              include: {
                position: true,
                department: true,
              },
            },
          },
        })

        if (!user || !user.isActive) {
          throw new UnauthorizedException('Invalid refresh token')
        }

        // Generate new tokens
        const newPayload = { sub: user.id, employeeCode: user.employeeCode, role: user.role }
        const accessToken = this.jwtService.sign(newPayload, { expiresIn: '7d' })
        const refreshToken = this.jwtService.sign({ ...newPayload, type: 'refresh' }, { expiresIn: '30d' })

        // Set headers for token mode
        response.setHeader('X-Access-Token', accessToken)
        response.setHeader('X-Refresh-Token', refreshToken)

        const { password: _, ...userWithoutPassword } = user
        return {
          access_token: accessToken,
          refresh_token: refreshToken, // ✅ Include refresh_token
          accessToken, // For iOS/Mac compatibility
          refreshToken,
          user: userWithoutPassword,
          message: 'Token refreshed successfully'
        }
      } else {
        // Cookie mode: Use existing refresh logic with JWT guard
        throw new UnauthorizedException('Cookie-based refresh should use authenticated endpoint')
      }
    } catch (error) {
      console.error('Refresh token error:', error)
      throw error
    }
  }

  @Post('refresh-cookie')
  @UseGuards(JwtAuthGuard) // This will read from cookie
  @ApiOperation({ summary: 'Refresh access token using cookie' })
  async refreshTokenCookie(
    @GetUser() user: any,
    @Res({ passthrough: true }) response: Response,
    @Req() request: any,
    @Body('rememberMe') rememberMe: boolean = false, // ✅ Provide default value
  ): Promise<AuthResponseDto> {
    // Use existing refresh logic for cookie mode
    return this.authService.refreshToken(
      user.id,
      response,
      rememberMe,
      request,
    )
  }

  @Post('forgot-password')
  @Public()
  @ApiOperation({ summary: 'Verify employee info for password reset' })
  @ApiResponse({ status: 200, description: 'Employee verification successful' })
  @ApiResponse({ status: 400, description: 'Invalid employee info' })
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({ summary: 'Reset password with verified employee info' })
  @ApiResponse({ status: 200, description: 'Password reset successful' })
  @ApiResponse({ status: 400, description: 'Invalid employee info' })
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  // Enhanced iOS debugging endpoint
  @Post('check-cookie')
  @Public()
  @ApiOperation({ summary: 'Check cookie compatibility and test cookie operations' })
  checkCookie(@Req() req: any, @Res({ passthrough: true }) response: Response) {
    const userAgent = req.headers['user-agent'] || '';
    
    // Enhanced device detection
    const iosPattern = /iPad|iPhone|iPod/i;
    const macPattern = /Mac.*OS.*X/i;
    const safariPattern = /Safari/i;
    const chromePattern = /Chrome|CriOS|EdgiOS/i;
    
    const isIOS = iosPattern.test(userAgent);
    const isMac = macPattern.test(userAgent);
    const isSafari = safariPattern.test(userAgent);
    const isChrome = chromePattern.test(userAgent);
    const isSimulator = userAgent.includes('Simulator');
    
    const isIOSDevice = isIOS || isMac;
    const isIOSSafari = isIOSDevice && isSafari && !isChrome;
    const isRealDevice = isIOS && !isSimulator;
    
    // Check current cookies
    const allCookies = req.cookies || {};
    const cookieHeader = req.headers.cookie;
    
    // ✅ Set test cookie with same settings as auth cookie
    const testToken = `test-${Date.now()}`;
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Set test cookie
    response.cookie('test_access_token', testToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: 300000, // 5 minutes
      path: '/',
    });

    return {
      success: true,
      deviceDetection: {
        userAgent: userAgent.substring(0, 150) + (userAgent.length > 150 ? '...' : ''),
        isIOS,
        isMac,
        isSafari,
        isChrome,
        isIOSDevice,
        isIOSSafari,
        isRealDevice,
        isSimulator,
        platform: req.headers['sec-ch-ua-platform'] || 'unknown'
      },
      cookies: {
        hasCookieHeader: !!cookieHeader,
        cookieHeaderLength: cookieHeader ? cookieHeader.length : 0,
        cookieHeaderRaw: cookieHeader ? cookieHeader.substring(0, 200) + '...' : 'undefined',
        
        // ✅ Only check access_token
        hasAccessToken: !!allCookies['access_token'],
        accessTokenPreview: allCookies['access_token'] ? allCookies['access_token'].substring(0, 10) + '...' : null,
        
        allCookieKeys: Object.keys(allCookies),
        cookieCount: Object.keys(allCookies).length,
      },
      headers: {
        origin: req.headers.origin,
        referer: req.headers.referer,
        host: req.headers.host,
        'sec-fetch-site': req.headers['sec-fetch-site'],
        'sec-fetch-mode': req.headers['sec-fetch-mode'],
        'sec-ch-ua': req.headers['sec-ch-ua'],
        'sec-ch-ua-platform': req.headers['sec-ch-ua-platform']
      },
      testCookie: {
        name: 'test_access_token',
        value: testToken,
        settings: {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax',
          maxAge: 300000,
          path: '/'
        }
      },
      recommendations: {
        cookieStrategy: 'single-access-token-lax',
        requiresSpecialHandling: isIOSSafari,
        isRealDeviceTest: isRealDevice,
        testAdvice: isRealDevice 
          ? 'Real device test - results are reliable'
          : 'Simulation detected - test on real device for accurate results'
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Enhanced test endpoint for cookie clearing
  @Post('test-cookie-clear')
  @Public()
  @ApiOperation({ summary: 'Test cookie clearing functionality' })
  testCookieClear(@Req() req: any, @Res({ passthrough: true }) response: Response) {
    const userAgent = req.headers['user-agent'] || '';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // First set a test cookie
    const testToken = `test-${Date.now()}`;
    response.cookie('access_token', testToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      maxAge: 60000, // 1 minute
      path: '/',
    });
    
    // Then immediately clear it using the same method as logout
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/',
    });
    
    // Additional clearing attempts
    response.clearCookie('access_token');
    response.clearCookie('access_token', { path: '/' });
    response.clearCookie('access_token', {
      secure: isProduction,
      path: '/'
    });

    return {
      success: true,
      message: 'Cookie set and cleared with simple options',
      testCookie: {
        name: 'access_token',
        value: testToken,
        wasSet: true,
        wasCleared: true,
        clearingMethods: 4
      },
      instructions: 'Check browser dev tools to verify cookie was properly cleared',
      timestamp: new Date().toISOString(),
    };
  }

  // Production cookie debug endpoint
  @Post('production-cookie-test')
  @Public()
  @ApiOperation({ summary: 'Test production cookie functionality' })
  productionCookieTest(@Req() req: any, @Res({ passthrough: true }) response: Response) {
    const userAgent = req.headers['user-agent'] || '';
    const origin = req.headers.origin || '';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Set test cookie with production settings
    const testToken = `prod-test-${Date.now()}`;
    
    // ✅ Use exact same settings as login
    response.cookie('test_production_cookie', testToken, {
      httpOnly: true,
      secure: false, // Same as login
      sameSite: 'lax' as const,
      maxAge: 300000, // 5 minutes
      path: '/',
    });
    
    // Always set fallback header in production
    response.setHeader('X-Access-Token', testToken);
    response.setHeader('X-Cookie-Fallback', 'true');

    return {
      success: true,
      production: isProduction,
      origin,
      userAgent: userAgent.substring(0, 100),
      testCookie: {
        name: 'test_production_cookie',
        value: testToken,
        settings: {
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
          maxAge: 300000,
          path: '/'
        }
      },
      fallback: {
        headerName: 'X-Access-Token',
        headerValue: testToken,
        fallbackEnabled: true
      },
      instructions: [
        '1. Check browser cookies for test_production_cookie',
        '2. Check localStorage for fallback token',
        '3. Verify CORS headers allow credentials',
        '4. Test from exact production domain'
      ],
      corsHeaders: {
        origin: req.headers.origin,
        credentials: 'include',
        allowedOrigin: origin.endsWith('.vercel.app') ? 'allowed' : 'check-config'
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Enhanced production debugging endpoint
  @Post('debug-cookie-production')
  @Public()
  @ApiOperation({ summary: 'Debug production cookie issues' })
  debugCookieProduction(@Req() req: any, @Res({ passthrough: true }) response: Response) {
    const userAgent = req.headers['user-agent'] || '';
    const origin = req.headers.origin || '';
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Set test cookie with EXACT production settings
    const testToken = `debug-${Date.now()}`;
    
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // true in production
      sameSite: isProduction ? 'none' as const : 'lax' as const, // none in production
      maxAge: 300000, // 5 minutes
      path: '/',
    };
    
    this.logger.log('🔍 Setting debug cookie with production settings:', {
      isProduction,
      cookieOptions,
      origin,
      userAgent: userAgent.substring(0, 50)
    });
    
    // Set test cookie
    response.cookie('debug_production_cookie', testToken, cookieOptions);
    
    // Set fallback headers
    response.setHeader('X-Access-Token', testToken);
    response.setHeader('X-Cookie-Fallback', 'true');
    response.setHeader('X-Cookie-Settings', JSON.stringify(cookieOptions));

    return {
      success: true,
      debug: {
        isProduction,
        origin,
        userAgent: userAgent.substring(0, 100),
        timestamp: new Date().toISOString(),
        testCookie: {
          name: 'debug_production_cookie',
          value: testToken,
          options: cookieOptions
        },
        fallbackHeaders: {
          'X-Access-Token': testToken,
          'X-Cookie-Fallback': 'true',
          'X-Cookie-Settings': JSON.stringify(cookieOptions)
        },
        currentCookies: {
          hasCookieHeader: !!req.headers.cookie,
          cookieHeader: req.headers.cookie || 'none',
          parsedCookies: req.cookies || {},
          cookieCount: req.cookies ? Object.keys(req.cookies).length : 0
        },
        instructions: [
          '1. Check browser dev tools → Application → Cookies',
          '2. Look for debug_production_cookie',
          '3. Check if SameSite=None and Secure=true in production',
          '4. Verify HTTPS is used for cookie to work',
          '5. Check localStorage for fallback token'
        ]
      }
    };
  }
}
