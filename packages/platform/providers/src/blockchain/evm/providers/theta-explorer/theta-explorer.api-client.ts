import { getErrorMessage } from '@exitbook/core';
import { err, ok, type Result } from 'neverthrow';

import type { ProviderConfig, ProviderOperation } from '../../../../core/blockchain/index.ts';
import { BaseApiClient, RegisterApiClient } from '../../../../core/blockchain/index.ts';
import { maskAddress } from '../../../../core/blockchain/utils/address-utils.ts';

import type { ThetaTransaction, ThetaAccountTxResponse } from './theta-explorer.types.ts';

@RegisterApiClient({
  baseUrl: 'https://explorer-api.thetatoken.org/api',
  blockchain: 'theta',
  capabilities: {
    supportedOperations: ['getRawAddressTransactions'],
  },
  defaultConfig: {
    rateLimit: {
      burstLimit: 10,
      requestsPerHour: 3600,
      requestsPerMinute: 60,
      requestsPerSecond: 1,
    },
    retries: 3,
    timeout: 10000,
  },
  description: 'Theta Explorer API for transaction and account data',
  displayName: 'Theta Explorer',
  name: 'theta-explorer',
  requiresApiKey: false,
})
export class ThetaExplorerApiClient extends BaseApiClient {
  constructor(config: ProviderConfig) {
    super(config);
  }

  async execute<T>(operation: ProviderOperation): Promise<Result<T, Error>> {
    this.logger.debug(`Executing operation: ${operation.type}`);

    switch (operation.type) {
      case 'getRawAddressTransactions': {
        const { address, since } = operation;
        this.logger.debug(`Fetching raw address transactions - Address: ${maskAddress(address)}`);
        return (await this.getRawAddressTransactions(address, since)) as Result<T, Error>;
      }
      default:
        return err(new Error(`Unsupported operation: ${operation.type}`));
    }
  }

  getHealthCheckConfig() {
    return {
      endpoint: '/supply/theta',
      method: 'GET' as const,
      validate: (response: unknown) => {
        const data = response as { total_supply?: number };
        return data && typeof data.total_supply === 'number';
      },
    };
  }

  private async getRawAddressTransactions(
    address: string,
    _since?: number
  ): Promise<Result<ThetaTransaction[], Error>> {
    const allTransactions: ThetaTransaction[] = [];

    const result = await this.getTransactions(address);

    if (result.isErr()) {
      this.logger.error(
        `Failed to fetch raw address transactions for ${address} - Error: ${getErrorMessage(result.error)}`
      );
      return err(result.error);
    }

    const allTypeTxs = result.value;
    allTransactions.push(...allTypeTxs);

    this.logger.debug(`Found ${allTransactions.length} total transactions for ${address} (${allTypeTxs.length})`);
    return ok(allTransactions);
  }

  private async getTransactions(address: string): Promise<Result<ThetaTransaction[], Error>> {
    const transactions: ThetaTransaction[] = [];
    let currentPage = 1;
    const limitPerPage = 100;
    let hasMorePages = true;

    while (hasMorePages) {
      const params = new URLSearchParams({
        limitNumber: limitPerPage.toString(),
        pageNumber: currentPage.toString(),
      });

      const result = await this.httpClient.get<ThetaAccountTxResponse>(
        `/accounttx/${address.toLowerCase()}?${params.toString()}`
      );

      if (result.isErr()) {
        // Theta Explorer returns 404 when no transactions are found for a type
        if (result.error.message.includes('HTTP 404')) {
          this.logger.debug(`No transactions found for ${maskAddress(address)}`);
          break;
        }
        return err(result.error);
      }

      const response = result.value;
      const pageTxs = response.body || [];
      transactions.push(...pageTxs);

      this.logger.debug(`Fetched page ${currentPage}/${response.totalPageNumber}: ${pageTxs.length} transactions`);

      hasMorePages = currentPage < response.totalPageNumber;
      currentPage++;

      if (currentPage > 100) {
        this.logger.warn('Reached maximum page limit (100), stopping pagination');
        break;
      }
    }

    return ok(transactions);
  }
}
