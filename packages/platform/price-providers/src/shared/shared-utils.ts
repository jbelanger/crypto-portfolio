/**
 * Pure utility functions for price data operations
 *
 * These are stateless, side-effect-free functions that can be easily tested
 * without mocks. They handle the "functional core" of price data processing.
 */

import type { Currency } from '@exitbook/core';
import { HttpClient } from '@exitbook/platform-http';
import type { Result } from 'neverthrow';
import { err, ok } from 'neverthrow';

import type { PriceData, PriceQuery } from './types/index.ts';

/**
 * Validate a raw price value from an API response
 *
 * @param price - Raw price value (may be undefined or invalid)
 * @param asset - Asset being priced
 * @param context - Context for error message (e.g., provider name, coin ID)
 * @returns Ok with price if valid, Err if invalid
 */
export function validateRawPrice(price: number | undefined, asset: Currency, context: string): Result<number, Error> {
  if (price === undefined || price <= 0) {
    const reason = price === undefined ? 'not found' : `invalid (${price}, must be positive)`;
    return err(new Error(`${context} price for ${asset.toString()}: ${reason}`));
  }
  return ok(price);
}

/**
 * Round timestamp to nearest day (for daily price lookups)
 */
export function roundToDay(date: Date): Date {
  const rounded = new Date(date);
  rounded.setUTCHours(0, 0, 0, 0);
  return rounded;
}

/**
 * Round timestamp to nearest hour (for hourly price lookups)
 */
export function roundToHour(date: Date): Date {
  const rounded = new Date(date);
  rounded.setUTCMinutes(0, 0, 0);
  return rounded;
}

/**
 * Round timestamp to nearest minute (for minute-level price lookups)
 */
export function roundToMinute(date: Date): Date {
  const rounded = new Date(date);
  rounded.setUTCSeconds(0, 0);
  return rounded;
}

/**
 * Round timestamp based on granularity
 * For undefined granularity (spot prices) or 'exact', returns original timestamp
 */
export function roundTimestampByGranularity(
  date: Date,
  granularity: 'exact' | 'minute' | 'hour' | 'day' | undefined
): Date {
  if (granularity === 'exact') {
    // Exact prices keep precise timestamp
    return date;
  }
  if (granularity === 'day') {
    return roundToDay(date);
  }
  if (granularity === 'hour') {
    return roundToHour(date);
  }
  if (granularity === 'minute') {
    return roundToMinute(date);
  }
  // Undefined granularity (spot price) - keep exact timestamp
  return date;
}

/**
 * Check if two timestamps are on the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getUTCFullYear() === date2.getUTCFullYear() &&
    date1.getUTCMonth() === date2.getUTCMonth() &&
    date1.getUTCDate() === date2.getUTCDate()
  );
}

/**
 * Validate that price data is reasonable
 * Returns error message if invalid, undefined if valid
 *
 * Pure function - takes current time as parameter for testability
 */
export function validatePriceData(data: PriceData, now: Date = new Date()): string | undefined {
  if (data.price <= 0) {
    return `Invalid price: ${data.price} (must be positive)`;
  }

  if (data.price > 1e12) {
    return `Suspicious price: ${data.price} (unreasonably high)`;
  }

  if (data.timestamp > now) {
    return `Invalid timestamp: ${data.timestamp.toISOString()} (future date)`;
  }

  if (data.fetchedAt < data.timestamp) {
    return `Invalid fetch time: fetched ${data.fetchedAt.toISOString()} before timestamp ${data.timestamp.toISOString()}`;
  }

  return undefined;
}

/**
 * Create a cache key for a price query
 *
 * @param query - Price query to create cache key for
 * @param defaultCurrency - Default currency to use if query.currency is not provided (defaults to 'USD')
 */
export function createCacheKey(query: PriceQuery, defaultCurrency = 'USD'): string {
  const roundedDate = roundToDay(query.timestamp);
  const currency = query.currency ?? defaultCurrency;

  return `${query.asset.toString()}:${currency.toString()}:${roundedDate.getTime()}`;
}

/**
 * Sort price data by timestamp (ascending)
 */
export function sortByTimestamp(prices: PriceData[]): PriceData[] {
  return [...prices].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Deduplicate price data, keeping the most recently fetched
 */
export function deduplicatePrices(prices: PriceData[]): PriceData[] {
  const map = new Map<string, PriceData>();

  for (const price of prices) {
    const key = `${price.asset.toString()}:${price.currency.toString()}:${price.timestamp.getTime()}`;
    const existing = map.get(key);

    if (!existing || price.fetchedAt > existing.fetchedAt) {
      map.set(key, price);
    }
  }

  return Array.from(map.values());
}

/**
 * Calculate percentage difference between two prices
 */
export function calculatePriceChange(oldPrice: number, newPrice: number): number {
  if (oldPrice === 0) return 0;
  return ((newPrice - oldPrice) / oldPrice) * 100;
}

/**
 * Format price for display with appropriate decimal places
 */
export function formatPrice(price: number, currency = 'USD'): string {
  // Use more decimals for low-value assets
  const decimals = price < 0.01 ? 8 : price < 1 ? 6 : 2;

  return `${currency} ${price.toFixed(decimals)}`;
}

/**
 * Check if a query is within a reasonable time range
 * Returns error message if invalid, undefined if valid
 *
 * Pure function - takes current time as parameter for testability
 */
export function validateQueryTimeRange(timestamp: Date, now: Date = new Date()): string | undefined {
  const minDate = new Date('2009-01-03'); // Bitcoin genesis block

  if (timestamp > now) {
    return `Cannot fetch future prices: ${timestamp.toISOString()}`;
  }

  if (timestamp < minDate) {
    return `Timestamp before crypto era: ${timestamp.toISOString()}`;
  }

  return undefined;
}

/**
 * HTTP Client Factory Functions
 * Shared configuration to avoid duplication across providers
 */

/**
 * Rate limit configuration for a provider
 */
export interface ProviderRateLimitConfig {
  /** Maximum burst requests allowed */
  burstLimit: number;
  /** Requests per hour limit */
  requestsPerHour: number;
  /** Requests per minute limit */
  requestsPerMinute: number;
  /** Requests per second limit */
  requestsPerSecond: number;
}

/**
 * Configuration for creating a provider HTTP client
 */
export interface ProviderHttpClientConfig {
  /** Base URL for the provider API */
  baseUrl: string;
  /** Provider name for logging */
  providerName: string;
  /** Optional API key for authentication */
  apiKey?: string | undefined;
  /** API key header name (defaults to 'api_key' query param if not specified) */
  apiKeyHeader?: string | undefined;
  /** Rate limit configuration */
  rateLimit: ProviderRateLimitConfig;
  /** Request timeout in milliseconds (default: 10000) */
  timeout?: number | undefined;
  /** Number of retries on failure (default: 3) */
  retries?: number | undefined;
  /** Additional default headers */
  additionalHeaders?: Record<string, string> | undefined;
}

/**
 * Create an HTTP client configured for a price provider
 *
 * Provides common defaults and consistent configuration across all providers
 */
export function createProviderHttpClient(config: ProviderHttpClientConfig): HttpClient {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...config.additionalHeaders,
  };

  // Add API key to headers if header name is specified
  if (config.apiKey && config.apiKeyHeader) {
    headers[config.apiKeyHeader] = config.apiKey;
  }

  return new HttpClient({
    baseUrl: config.baseUrl,
    defaultHeaders: headers,
    providerName: config.providerName,
    rateLimit: config.rateLimit,
    retries: config.retries ?? 3,
    timeout: config.timeout ?? 10000,
  });
}
