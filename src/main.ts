import { NestFactory } from '@nestjs/core';
import { ValidationPipe, BadRequestException, RequestMethod } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentConfig } from './config/config.environment';
import cookieParser from 'cookie-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from './common/prisma.service';
import { webcrypto } from 'node:crypto';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load env vars before any module initialisation so PrismaClient can read DATABASE_URL
dotenv.config({ path: resolve(process.cwd(), '.env.local') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

// Polyfill for crypto in Node.js environment
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto as any;
}

async function bootstrap() {
  try {
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Add cron job status logging for Railway
    if (nodeEnv === 'production') {
      console.log('⏰ Cron jobs enabled in production');
      console.log('📅 Schedule: Lock reports every Friday 1:00 AM (UTC+7)');
      console.log('🔧 Cron expression: 0 18 * * 4 (18:00 UTC Thursday)');
    }


    // Log database connection info (masked)
    if (process.env.DATABASE_URL) {
      const maskedUrl = process.env.DATABASE_URL.replace(
        /\/\/([^:]+):([^@]+)@/,
        '//***:***@',
      );
      console.log(`📡 Database URL: ${maskedUrl}`);

      if (maskedUrl.includes('neon.tech')) {
        console.log('🌐 Using Neon PostgreSQL (Serverless)');
        console.log('💡 Note: Neon databases may cold-start, expect 1-2s initial delay');
      } else if (maskedUrl.includes('localhost')) {
        console.log('✅ Using local database (development)');
      } else {
        console.log('🔍 Using external database');
      }
    }

    // Enhanced app creation with database retry
    let app: NestExpressApplication;
    const maxAppRetries = 3;
    
    for (let attempt = 1; attempt <= maxAppRetries; attempt++) {
      try {
        console.log(`🔄 Creating app instance (attempt ${attempt}/${maxAppRetries})...`);
        app = await NestFactory.create<NestExpressApplication>(AppModule, {
          logger:
            process.env.NODE_ENV === 'production'
              ? ['error', 'warn', 'log']
              : ['log', 'error', 'warn', 'debug'],
          bufferLogs: true,
        });
        console.log('✅ App instance created successfully');
        break;
      } catch (error) {
        console.error(`❌ Failed to create app (attempt ${attempt}/${maxAppRetries}):`, error.message);
        if (attempt === maxAppRetries) {
          if (error.message?.includes('database server')) {
            console.error('💡 Database connection failed. Check Neon database status at https://neon.tech/status');
            console.error('💡 Or verify your DATABASE_URL credentials in the Neon console');
          }
          throw error;
        }
        const delay = 5000 * attempt; // 5s, 10s, 15s
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Essential: Enable shutdown hooks for proper cleanup
    app.enableShutdownHooks();

    // ⭐ Enable WebSocket adapter for Socket.io
    app.useWebSocketAdapter(new IoAdapter(app));
    console.log('✅ WebSocket adapter enabled');

    // Essential middleware
    app.use(cookieParser());
    app.set('trust proxy', 1);

    const envConfig = app.get(EnvironmentConfig);
    const corsConfig = envConfig.getCorsConfig();

    // Apply CORS configuration with enhanced production support
    app.enableCors({
      origin: (origin, callback) => {
        const allowedOrigins = [
          'https://thtxts.vercel.app',
          'http://localhost:3000',
          'http://10.45.2.125:3000',
          'http://127.0.0.1:3000'
        ];

        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) {
          return callback(null, true);
        }

        // Check exact match first
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // ✅ CRITICAL: Allow all vercel.app subdomains in production
        if (nodeEnv === 'production' && origin.endsWith('.vercel.app')) {
          return callback(null, true);
        }

        // Allow localhost in development
        if (nodeEnv !== 'production') {
          if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
            return callback(null, true);
          }
          return callback(null, true); // Allow all in dev
        }

        // Block unknown origins in production
        console.warn(`❌ Blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'), false);
      },
      credentials: true, // ✅ CRITICAL for cookies
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type', 
        'Accept',
        'Authorization',
        'Cookie',
        'Set-Cookie',
        'X-Access-Token',
        'X-Cookie-Fallback',
        'X-Cookie-Settings', // ✅ Added for debugging
        'User-Agent'
      ],
      exposedHeaders: [
        'Set-Cookie',
        'X-Access-Token', 
        'X-Cookie-Fallback',
        'X-Cookie-Settings', // ✅ Added for debugging
        'X-iOS-Fallback',
        'X-iOS-Version'
      ],
      optionsSuccessStatus: 200,
      preflightContinue: false,
    });
    
    app.setGlobalPrefix('api', {
      exclude: [
        { path: '/', method: RequestMethod.GET }, // Root path
        { path: 'health', method: RequestMethod.GET }, // Health endpoint for Railway
      ],
    });

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true, // ✅ Bật lại
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
        exceptionFactory: (errors) => {
          console.error('❌ VALIDATION ERRORS:', JSON.stringify(errors, null, 2));
          errors.forEach(error => {
            console.error(`  Field: ${error.property}`);
            console.error(`  Value: ${error.value}`);
            console.error(`  Constraints:`, error.constraints);
          });
          return new BadRequestException(
            errors.map((error) => ({
              property: error.property,
              value: error.value,
              constraints: error.constraints,
            })),
          );
        },
      }),
    );

    // Global exception filter
    app.useGlobalFilters(new HttpExceptionFilter());

    // Swagger only in development
    if (process.env.NODE_ENV !== 'production') {
      const config = new DocumentBuilder()
        .setTitle('Weekly Work Report API')
        .setDescription('API documentation for Weekly Work Report System')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('auth', 'Authentication endpoints')
        .addTag('users', 'User management')
        .addTag('reports', 'Weekly reports')
        .build();

      const document = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup('api', app, document, {
        customSiteTitle: 'Weekly Report API Documentation',
        customfavIcon: '/favicon.ico',
        customJs: [
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js',
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.min.js',
        ],
        customCssUrl: [
          'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
        ],
      });
      console.log('📚 Swagger documentation available at /api');
    }

    const port = envConfig.port || 8080;

    // Enhanced graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      console.log(`📥 Received ${signal} signal`);
      console.log('🔄 Gracefully shutting down...');
      
      try {
        await app.close();
        console.log('✅ Application closed gracefully');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    await app.listen(port, '0.0.0.0');

    console.log(`🎉 Application is running on: http://0.0.0.0:${port}`);
    console.log(`🏥 Health check: http://0.0.0.0:${port}/health`);
    console.log(`🔗 API health: http://0.0.0.0:${port}/api/health`);
    console.log(`📊 Database health: http://0.0.0.0:${port}/api/health/db`);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`📚 API documentation: http://0.0.0.0:${port}/api`);
    }
    
    // Test database connection after startup with retry
    setTimeout(async () => {
      try {
        const prismaService = app.get(PrismaService);
        const isHealthy = await prismaService.isHealthy();
        if (isHealthy) {
          console.log('✅ Database connection verified and healthy');
        } else {
          console.log('⚠️ Database connection unstable, but app is running');
        }
      } catch (error) {
        console.error('❌ Database verification failed:', error.message);
        console.error('💡 App will continue running, but database operations may fail');
      }
    }, 3000);
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    if (error.message?.includes('database server')) {
      console.error('\n🔧 Troubleshooting tips:');
      console.error('1. Check if Neon database is active: https://console.neon.tech/');
      console.error('2. Verify DATABASE_URL in your .env file');
      console.error('3. Check Neon service status: https://neon.tech/status');
      console.error('4. Ensure your IP is not blocked by Neon');
    }
    process.exit(1);
  }
}

// Enhanced Vercel handler for serverless deployment
export default async (req: any, res: any) => {
  try {
    // Set CORS headers for all requests
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://thtxts.vercel.app'
    ];

    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin,X-Requested-With,Content-Type,Accept,Authorization,Cache-Control',
    );

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Quick responses for common requests
    if (req.url === '/api/health') {
      res.status(200).json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: '1.0.0',
      });
      return;
    }

    if (req.url === '/' || req.url === '/api') {
      res.json({
        message: 'Weekly Work Report API',
        status: 'ok',
        timestamp: new Date().toISOString(),
        docs: '/api',
        health: '/health',
      });
      return;
    }

    // For serverless platforms, create app instance
    const { AppModule } = await import('./app.module');
    const { NestFactory } = await import('@nestjs/core');

    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn'],
    });

    app.enableCors({
      origin: allowedOrigins,
      credentials: true,
    });

    app.setGlobalPrefix('api');

    const expressApp = app.getHttpAdapter().getInstance();
    return expressApp(req, res);
  } catch (error) {
    console.error('🚨 Handler error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Something went wrong',
      timestamp: new Date().toISOString(),
    });
  }
};

// Start application if running directly
if (require.main === module) {
  bootstrap();
}
