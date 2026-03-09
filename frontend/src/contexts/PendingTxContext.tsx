import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { HathorService } from '../services/hathor';
import { ACTIVE_STORAGE_SCOPE } from '../config/network';

const LOTTERY_BLUEPRINT_ID = import.meta.env.VITE_LOTTERY_BLUEPRINT_ID || '';
const PENDING_TX_STORAGE_KEY = `lottery_pending_txs_${ACTIVE_STORAGE_SCOPE}`;

interface PendingTx {
    txId: string;
    type: 'create' | 'buy' | 'draw' | 'claim';
    data?: any;
    timestamp: number;
}

interface PendingTxContextType {
    pendingTxs: PendingTx[];
    addPendingTx: (txId: string, type: PendingTx['type'], data?: any) => void;
    isTxPending: (txId: string) => boolean;
}

const PendingTxContext = createContext<PendingTxContextType | undefined>(undefined);

export const PendingTxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [pendingTxs, setPendingTxs] = useState<PendingTx[]>(() => {
        const saved = localStorage.getItem(PENDING_TX_STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    });

    // Save to localStorage whenever list changes
    useEffect(() => {
        localStorage.setItem(PENDING_TX_STORAGE_KEY, JSON.stringify(pendingTxs));
    }, [pendingTxs]);

    const addPendingTx = useCallback((txId: string, type: PendingTx['type'], data?: any) => {
        if (!txId) return;
        setPendingTxs(prev => [...prev, {
            txId,
            type,
            data,
            timestamp: Date.now()
        }]);
    }, []);

    const isTxPending = useCallback((txId: string) => {
        return pendingTxs.some(tx => tx.txId === txId);
    }, [pendingTxs]);

    // Background polling for confirmations
    useEffect(() => {
        if (pendingTxs.length === 0) return;

        const interval = setInterval(async () => {
            const confirmedIds: string[] = [];

            for (const tx of pendingTxs) {
                try {
                    // Check if transaction is confirmed by looking for first_block
                    const data = await HathorService.getTransaction(tx.txId);
                    console.log(`[PendingTx] Checking ${tx.txId}:`, data);

                    // Require first_block to be present - this means it's actually mined
                    // Just being in the mempool (success: true) is not enough
                    const isConfirmed = data && (
                        data.first_block ||
                        data.meta?.first_block ||
                        (data.tx && data.tx.first_block)
                    );

                    if (isConfirmed) {
                        console.log(`[PendingTx] ✓ Tx confirmed (has first_block): ${tx.txId}`);
                        confirmedIds.push(tx.txId);

                        // If it's a new lottery, ensure it's in the my_lotteries list
                        if (tx.type === 'create') {
                            const storageKey = `my_lotteries_${LOTTERY_BLUEPRINT_ID}`;
                            const localLotteries = JSON.parse(localStorage.getItem(storageKey) || '[]');
                            if (!localLotteries.includes(tx.txId)) {
                                localStorage.setItem(storageKey, JSON.stringify([...localLotteries, tx.txId]));
                            }
                        }
                    } else {
                        console.log(`[PendingTx] ⏳ Tx not yet confirmed: ${tx.txId}`);
                    }
                } catch (e) {
                    // Not found yet, continue polling
                    console.log(`[PendingTx] Transaction not found yet: ${tx.txId}`);
                }
            }

            if (confirmedIds.length > 0) {
                setPendingTxs(prev => prev.filter(tx => !confirmedIds.includes(tx.txId)));
                // Dispatch event to notify pages to refresh
                window.dispatchEvent(new CustomEvent('lottery-tx-confirmed'));
            }
        }, 5000); // Poll every 5 seconds

        return () => clearInterval(interval);
    }, [pendingTxs]);

    return (
        <PendingTxContext.Provider value={{
            pendingTxs,
            addPendingTx,
            isTxPending
        }}>
            {children}
        </PendingTxContext.Provider>
    );
};

export const usePendingTxs = () => {
    const context = useContext(PendingTxContext);
    if (!context) {
        throw new Error('usePendingTxs must be used within a PendingTxProvider');
    }
    return context;
};
