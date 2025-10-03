/**
 * Auto-registration of Cosmos SDK blockchain API clients
 *
 * This file imports all Cosmos provider API clients to trigger their decorators.
 * The @RegisterApiClient decorator registers each client with the BlockchainProviderManager.
 *
 * Current providers:
 * - Injective Explorer (Injective only)
 *
 * Future providers:
 * - Mintscan (multi-chain: Injective, Osmosis, Cosmos Hub, Terra, etc.)
 * - Cosmos Directory API (universal RPC/REST access)
 */

// Injective Explorer - Injective only
import './providers/injective-explorer/injective-explorer.api-client.js';

// Future: Add more multi-chain providers here
// import './providers/mintscan/mintscan.api-client.js';
// import './providers/cosmos-directory/cosmos-directory.api-client.js';
