import { ACTIVE_HATHOR_NETWORK } from '../config/network';

export interface ContractState {
    description: string;
    price: number;
    commission: number;
    pot: number;
    participants: string[];
    winner: string | null;
    state: 'OPEN' | 'CLOSED';
    creator: string;
    creator_payout: number;
    winner_payout: number;
}

// API endpoint for Nano Contract state
const NC_API_BASE = ACTIVE_HATHOR_NETWORK.rpc;

/**
 * Service to interact with Hathor Nano Contracts via full node API
 */
export const HathorService = {
    /**
     * Fetch the state of a specific Nano Contract instance from the network
     */
    async getContractState(contractId: string): Promise<ContractState> {
        try {
            // Query top-level fields for single-lottery contract
            // Note: 'participants' is not a stored field - we calculate it from pot/price
            const fields = ['description', 'price', 'commission', 'pot', 'winner', 'state', 'creator', 'creator_payout', 'winner_payout'];
            const url = `${NC_API_BASE}nano_contract/state?id=${contractId}&fields[]=${fields.join('&fields[]=')}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch contract state: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('[HathorService] Contract state response:', data);

            if (!data.success) {
                throw new Error(data.message || 'Failed to fetch contract state');
            }

            const f = data.fields || {};

            const price = f.price?.value || 0;
            const pot = f.pot?.value || 0;

            // Calculate number of participants from pot / price
            const participantCount = price > 0 ? Math.floor(pot / price) : 0;
            // Create a placeholder array for UI compatibility
            const participants = Array(participantCount).fill('participant');

            console.log('[HathorService] Calculated participants:', { pot, price, participantCount });

            return {
                description: f.description?.value || 'Unknown Lottery',
                price: price / 100,
                commission: f.commission?.value || 0,
                pot: pot / 100,
                participants: participants,
                winner: f.winner?.value || null,
                state: f.state?.value === 'CLOSED' ? 'CLOSED' : 'OPEN',
                creator: f.creator?.value || '',
                creator_payout: (f.creator_payout?.value || 0) / 100,
                winner_payout: (f.winner_payout?.value || 0) / 100
            };
        } catch (error) {
            console.error("Error fetching contract state:", error);
            throw error;
        }
    },

    /**
     * List lottery contract instances from a blueprint
     * Note: This requires an indexer or explorer API in production
     */
    async listLotteries(blueprintId: string): Promise<string[]> {
        try {
            // In production, you'd query an indexer for all NC instances of this blueprint
            // For now, check if there's a stored list or use the explorer API
            const url = `${NC_API_BASE}nano_contract/blueprint?blueprint_id=${blueprintId}`;

            const response = await fetch(url);
            if (!response.ok) {
                console.log('Blueprint query not available, returning empty list');
                return [];
            }

            const data = await response.json();
            return data.nc_ids || [];
        } catch (error) {
            console.error("Error listing lotteries:", error);
            return [];
        }
    },

    /**
     * Get transaction details
     */
    async getTransaction(txId: string): Promise<any> {
        try {
            const response = await fetch(`${NC_API_BASE}transaction?id=${txId}`);
            if (!response.ok) {
                throw new Error('Transaction not found');
            }
            return await response.json();
        } catch (error) {
            console.error("Error fetching transaction:", error);
            throw error;
        }
    },

    /**
     * Get contract transaction history
     */
    async getContractHistory(contractId: string): Promise<any[]> {
        try {
            const response = await fetch(`${NC_API_BASE}nano_contract/history?id=${contractId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch contract history');
            }
            const data = await response.json();
            return data.history || [];
        } catch (error) {
            console.error("Error fetching contract history:", error);
            return [];
        }
    },

    /**
     * Helper to format HTR amounts (integers in cents)
     */
    toCents(amount: number): number {
        return Math.floor(amount * 100);
    },

    /**
     * Format from cents to HTR
     */
    fromCents(cents: number): number {
        return cents / 100;
    }
};
