import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { EnvironmentConfig } from '../config/config.environment';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private prisma: PrismaService,
    private envConfig: EnvironmentConfig,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Priority 1: Authorization header (for iOS/Mac token mode)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        
        // Priority 2: Cookie (for standard web browsers)
        (request: Request) => {
          const cookies = request?.cookies || {};
          const token = cookies['access_token'];

          // Enhanced debug logging
          if (this.envConfig.isProduction) {
            const userAgent = request?.headers?.['user-agent'] || '';
            const authMode = request?.headers?.['x-auth-mode'] || 'cookie';
            const isIOSOrMac = /iPad|iPhone|iPod|Macintosh/i.test(userAgent);
            
            this.logger.log('JWT Extraction Debug:', {
              authMode,
              isIOSOrMac,
              hasAuthHeader: !!request?.headers?.authorization,
              hasCookieToken: !!token,
              tokenSource: request?.headers?.authorization ? 'header' : (token ? 'cookie' : 'none'),
              userAgent: userAgent?.substring(0, 50),
              method: request?.method,
              path: request?.url,
            });
          }

          return token;
        },
        
        // Priority 3: Custom header fallback
        (request: Request) => {
          return request?.headers?.['x-access-token'] as string;
        }
      ]),
      ignoreExpiration: false,
      secretOrKey: envConfig.jwtSecret,
      passReqToCallback: false,
    });
  }

  async validate(payload: any) {
    try {

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          office: true,
          jobPosition: {
            include: {
              position: true,
              department: {
                select: {
                  id: true,
                  name: true,
                  officeId: true,
                },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        if (this.envConfig.isProduction) {
          this.logger.warn('JWT Validation Failed:', {
            userId: payload.sub,
            userExists: !!user,
            userActive: user?.isActive,
          });
        }
        throw new UnauthorizedException('User not found or inactive');
      }

      const { password, ...userWithoutPassword } = user;

      return userWithoutPassword;
    } catch (error) {
      if (this.envConfig.isProduction) {
        this.logger.error('JWT Validation Error:', {
          error: error.message,
          payloadExp: payload?.exp,
          payloadIat: payload?.iat,
          currentTime: Math.floor(Date.now() / 1000),
        });
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
