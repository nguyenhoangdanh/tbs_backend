import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(key);
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl || 300); // 5 minutes default
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  // Remove reset method as it's not supported by cache-manager v5+
  // If you need to clear all cache, use specific key patterns or Redis FLUSHALL
  async clearPattern(pattern: string): Promise<void> {
    // This would require Redis-specific implementation
    // For now, we'll just delete commonly used cache keys
    const commonKeys = [
      'worksheet-analytics',
      'factory-dashboard',
      'realtime-analytics'
    ];
    
    for (const keyPrefix of commonKeys) {
      // In a real implementation, you'd use Redis SCAN to find matching keys
      // For now, just delete known keys if they exist
      try {
        await this.cacheManager.del(keyPrefix);
      } catch (error) {
        // Ignore if key doesn't exist
      }
    }
  }

  // Worksheet specific cache methods
  async cacheWorksheetAnalytics(worksheetId: string, data: any): Promise<void> {
    await this.set(`worksheet-analytics:${worksheetId}`, data, 120); // 2 minutes
  }

  async getCachedWorksheetAnalytics(worksheetId: string): Promise<any> {
    return await this.get(`worksheet-analytics:${worksheetId}`);
  }

  // Dashboard cache methods
  async cacheFactoryDashboard(factoryId: string, date: string, data: any): Promise<void> {
    await this.set(`factory-dashboard:${factoryId}:${date}`, data, 60); // 1 minute
  }

  async getCachedFactoryDashboard(factoryId: string, date: string): Promise<any> {
    return await this.get(`factory-dashboard:${factoryId}:${date}`);
  }

  // Realtime analytics cache
  async cacheRealtimeAnalytics(key: string, data: any): Promise<void> {
    await this.set(`realtime-analytics:${key}`, data, 30); // 30 seconds
  }

  async getCachedRealtimeAnalytics(key: string): Promise<any> {
    return await this.get(`realtime-analytics:${key}`);
  }

  // Clear worksheet-related cache
  async clearWorksheetCache(worksheetId: string): Promise<void> {
    await this.del(`worksheet-analytics:${worksheetId}`);
    // Clear related factory dashboard cache by pattern would require Redis SCAN
    // For now, we'll clear when we know the specific keys
  }

  // Clear factory dashboard cache
  async clearFactoryDashboardCache(factoryId: string, date: string): Promise<void> {
    await this.del(`factory-dashboard:${factoryId}:${date}`);
  }
}
