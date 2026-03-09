import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { HathorService } from '../services/hathor';
import type { ContractState } from '../services/hathor';
import { usePendingTxs } from '../contexts/PendingTxContext';
import Toast from '../components/Toast';

interface Lottery extends ContractState {
    id: string;
}

// Your deployed lottery blueprint ID - set this to your actual blueprint
const LOTTERY_BLUEPRINT_ID = import.meta.env.VITE_LOTTERY_BLUEPRINT_ID || '';

// For demo: list of known contract IDs (in production, fetch from indexer)
const KNOWN_CONTRACTS = import.meta.env.VITE_LOTTERY_CONTRACTS?.split(',') || [];

const Dashboard: React.FC = () => {
    const { connected, address, balance, connecting } = useWallet();
    const [lotteries, setLotteries] = useState<Lottery[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { pendingTxs, isTxPending } = usePendingTxs();

    console.log('[Dashboard] Render. PendingTxs:', pendingTxs.length, pendingTxs);

    const fetchLotteries = async () => {
        setLoading(true);
        setError(null);

        try {
            let contractIds: string[] = [];

            // Try to fetch from blueprint if available
            if (LOTTERY_BLUEPRINT_ID) {
                try {
                    const blueprintLotteries = await HathorService.listLotteries(LOTTERY_BLUEPRINT_ID);
                    contractIds = [...contractIds, ...blueprintLotteries];
                } catch (e) {
                    console.log('Blueprint listing failed, skipping');
                }
            }

            // Add known contracts from env
            if (KNOWN_CONTRACTS.length > 0) {
                contractIds = [...contractIds, ...KNOWN_CONTRACTS];
            }

            // Add lotteries created locally (stored in localStorage)
            // Use blueprint-specific key to avoid showing lotteries from other deployments
            const storageKey = `my_lotteries_${LOTTERY_BLUEPRINT_ID}`;
            const localLotteries = JSON.parse(localStorage.getItem(storageKey) || '[]')
                .filter((id: any) => typeof id === 'string' && id.length > 0);
            contractIds = [...contractIds, ...localLotteries];

            // Add pending creations
            const pendingCreationIds = pendingTxs
                .filter(tx => tx.type === 'create')
                .map(tx => tx.txId)
                .filter((id: any) => typeof id === 'string' && id.length > 0);
            contractIds = [...contractIds, ...pendingCreationIds];

            // Remove duplicates and invalid entries (extra safe)
            contractIds = Array.from(new Set(contractIds.filter(id => typeof id === 'string' && id.length > 0)));

            if (contractIds.length === 0) {
                setLotteries([]);
                setLoading(false);
                return;
            }

            // Fetch state for each contract
            const loadedLotteries = await Promise.all(
                contractIds.map(async (id: string) => {
                    try {
                        const state = await HathorService.getContractState(id);
                        return { ...state, id };
                    } catch (err) {
                        // If it's pending, we don't expect it to have state yet
                        if (isTxPending(id)) {
                            const pendingData = pendingTxs.find(tx => tx.txId === id);
                            return {
                                id,
                                description: pendingData?.data?.description || 'Launching...',
                                price: 0,
                                commission: 0,
                                pot: 0,
                                participants: [],
                                winner: null,
                                state: 'OPEN' as const,
                                creator: address || ''
                            };
                        }

                        // Check if the transaction actually failed
                        try {
                            const tx = await HathorService.getTransaction(id);
                            if (tx.meta?.nc_execution === 'failure' || tx.tx?.nc_execution === 'failure' || tx.meta?.voided_by?.length > 0) {
                                console.log(`[Dashboard] Contract ${id} failed to execute or was voided`);
                                return {
                                    id,
                                    description: 'Creation Failed (Contract Error)',
                                    price: 0,
                                    commission: 0,
                                    pot: 0,
                                    participants: [],
                                    winner: null,
                                    state: 'CLOSED' as const,
                                    creator: address || '',
                                    creator_payout: 0,
                                    winner_payout: 0
                                };
                            }
                        } catch (e) { /* ignore */ }

                        // If it's a known contract but state fetch failed (e.g. 404 during indexing)
                        // show it as "Syncing" instead of removing it
                        console.log(`[Dashboard] Contract ${id} not ready yet, showing as syncing`);
                        return {
                            id,
                            description: 'Syncing State...',
                            price: 0,
                            commission: 0,
                            pot: 0,
                            participants: [],
                            winner: null,
                            state: 'OPEN' as const,
                            creator: address || '',
                            creator_payout: 0,
                            winner_payout: 0
                        };
                    }
                })
            );

            setLotteries(loadedLotteries.filter((l): l is Lottery => l !== null));
        } catch (err: any) {
            console.error("Failed to fetch lotteries:", err);
            setError(err.message || 'Failed to load lotteries');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLotteries();

        // Listen for transaction confirmations to refresh state
        const handleRefresh = () => {
            console.log('[Dashboard] Refreshing after confirmation');
            fetchLotteries();
        };

        window.addEventListener('lottery-tx-confirmed', handleRefresh);
        return () => window.removeEventListener('lottery-tx-confirmed', handleRefresh);
    }, [pendingTxs.length]);

    return (
        <>
            <Toast
                visible={pendingTxs.length > 0}
                type="pending"
                message={`${pendingTxs.length} transaction${pendingTxs.length > 1 ? 's' : ''} waiting for confirmation...`}
            />
            <div className="container">
                {/* Wallet Quick Stats */}
                {connected && (
                    <div className="flex flex-wrap gap-6 mb-6 p-4 bg-hover border rounded-lg">
                        <div>
                            <div className="tech-label">Connected Address</div>
                            <div className="tech-display text-sm truncate" style={{ maxWidth: '300px' }}>{address}</div>
                        </div>
                        <div>
                            <div className="tech-label">Available Balance</div>
                            <div className="tech-value text-main">{balance.toFixed(2)} HTR</div>
                        </div>
                    </div>
                )}

                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h1>Active Lotteries</h1>
                        <p className="text-secondary">Browse and participate in decentralized jackpots on Hathor Network.</p>
                    </div>
                    {connected && (
                        <Link to="/create" className="btn-primary">
                            Launch New Lottery
                        </Link>
                    )}
                </div>

                {/* Error State */}
                {error && (
                    <div className="card p-4 mb-6 border-dashed" style={{ borderColor: '#ff4444' }}>
                        <p className="text-secondary">{error}</p>
                    </div>
                )}

                {/* Loading State */}
                {loading ? (
                    <div className="grid grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="card animate-pulse" style={{ height: '200px' }}></div>
                        ))}
                    </div>
                ) : lotteries.length > 0 ? (
                    <div className="grid grid-cols-3 gap-6">
                        {lotteries.map((lottery) => (
                            <div key={lottery.id} className="lottery-card">
                                <div className="card-header">
                                    <div className="flex gap-2">
                                        <div className={lottery.state === 'OPEN' ? 'badge badge-success' : 'badge badge-error'}>
                                            {lottery.state}
                                        </div>
                                        {isTxPending(lottery.id) && (
                                            <div className="badge animate-pulse" style={{
                                                background: 'rgba(138, 43, 226, 0.2)',
                                                color: 'var(--main-color)',
                                                border: '1px solid var(--main-color)',
                                                fontWeight: 'bold',
                                                letterSpacing: '0.05em'
                                            }}>
                                                WAITING CONFIRMATION
                                            </div>
                                        )}
                                    </div>
                                    <div className="tech-label">{lottery.id.substring(0, 12)}...</div>
                                </div>

                                <h2>{lottery.description}</h2>

                                <div className="flex items-baseline gap-2">
                                    <span className="tech-value text-xl">{lottery.price}</span>
                                    <span className="tech-label">HTR / ticket</span>
                                </div>

                                <div className="card-footer">
                                    <div className="flex justify-between mb-4">
                                        <div>
                                            <div className="tech-label">Pot</div>
                                            <div className="tech-value">{lottery.pot} HTR</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="tech-label">Participants</div>
                                            <div className="tech-value">{lottery.participants.length}</div>
                                        </div>
                                    </div>

                                    <Link to={`/lottery/${lottery.id}`} className="btn-secondary w-full text-center">
                                        View Details
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="card p-6 text-center border-dashed">
                        <p className="text-secondary mb-4">
                            {LOTTERY_BLUEPRINT_ID || KNOWN_CONTRACTS.length > 0
                                ? 'No active lotteries found on the network.'
                                : 'Configure VITE_LOTTERY_BLUEPRINT_ID or VITE_LOTTERY_CONTRACTS in your .env file.'}
                        </p>
                        {connected ? (
                            <Link to="/create" className="btn-primary">Be the first to launch one</Link>
                        ) : (
                            <p className="tech-label">{connecting ? 'Connecting...' : 'Connect your wallet to get started'}</p>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default Dashboard;
