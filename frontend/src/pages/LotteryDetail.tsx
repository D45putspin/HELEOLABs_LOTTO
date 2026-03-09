import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { HathorService } from '../services/hathor';
import type { ContractState } from '../services/hathor';
import { usePendingTxs } from '../contexts/PendingTxContext';
import NotificationModal from '../components/NotificationModal';
import type { NotificationType } from '../components/NotificationModal';
import Toast from '../components/Toast';

const LotteryDetail: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const { connected, signNanoContractTx, address } = useWallet();
    const [lottery, setLottery] = useState<ContractState | null>(null);
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState(false);
    const [drawing, setDrawing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { addPendingTx, isTxPending } = usePendingTxs();
    const [waitingWallet, setWaitingWallet] = useState(false);
    const [lastTxId, setLastTxId] = useState<string | null>(null);
    const [payouts, setPayouts] = useState<{ winner?: string; creator?: string }>({});

    // Modal state
    const [modal, setModal] = useState<{
        isOpen: boolean;
        type: NotificationType;
        title: string;
        message: string;
        txId?: string;
    }>({
        isOpen: false,
        type: 'success',
        title: '',
        message: ''
    });

    const fetchDetail = async () => {
        if (!id) return;
        setLoading(true);
        setError(null);
        try {
            const state = await HathorService.getContractState(id);
            setLottery(state);

            // If closed, fetch payouts
            if (state.state === 'CLOSED') {
                const history = await HathorService.getContractHistory(id);
                console.log('[LotteryDetail] History:', history);

                const foundPayouts: { winner?: string; creator?: string } = {};

                // History items are transactions. We look for 'claim_reward' method calls.
                // Note: The specific format depends on the full-node response.
                // We assume history items have nc_id, method, and caller.
                history.forEach(tx => {
                    console.log('[LotteryDetail] Checking history item:', tx);
                    // Check for claim_reward method call
                    // Handle various potential API field names for method
                    const method = tx.nc_method || tx.method || '';
                    const isClaim = method === 'claim_reward';

                    if (isClaim) {
                        const caller = (tx.caller || '').toLowerCase();
                        if (caller === state.winner?.toLowerCase()) {
                            foundPayouts.winner = tx.tx_id || tx.hash;
                        } else if (caller === state.creator?.toLowerCase()) {
                            foundPayouts.creator = tx.tx_id || tx.hash;
                        }
                    }
                });
                setPayouts(foundPayouts);
            }
        } catch (err: any) {
            console.error("Error fetching lottery detail:", err);
            if (err.message?.includes('Not Found')) {
                setError('Indexing... This new lottery was found on the network but its details are still being processed. Please wait a few seconds.');
            } else {
                setError(err.message || 'Failed to load lottery');
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetail();

        // Listen for transaction confirmations to refresh state
        const handleRefresh = () => {
            console.log('[LotteryDetail] Refreshing after confirmation');
            fetchDetail();
        };

        window.addEventListener('lottery-tx-confirmed', handleRefresh);
        return () => window.removeEventListener('lottery-tx-confirmed', handleRefresh);
    }, [id]);

    const handleBuyTicket = async () => {
        if (!connected || !lottery || !id) return;
        setBuying(true);
        setError(null);

        try {
            if (!address) {
                alert('Wallet address not found. Please try re-connecting your wallet.');
                return;
            }

            const purchaseAmount = HathorService.toCents(lottery.price);
            console.log('[BuyTicket] Initiating purchase...', { id, purchaseAmount, address });

            // Sign and send via WalletConnect
            setWaitingWallet(true);
            const result = await signNanoContractTx({
                ncId: id,
                method: 'buy_ticket',
                args: [],
                actions: [
                    {
                        type: 'deposit',
                        token: '00', // HTR token UID
                        amount: purchaseAmount, // Changed to number
                    }
                ]
            });

            console.log('[BuyTicket] Transaction sent:', result);
            setWaitingWallet(false);

            // Track pending transaction
            addPendingTx(result.txId, 'buy', { lotteryId: id });
            setLastTxId(result.txId);

            setModal({
                isOpen: true,
                type: 'success',
                title: 'Ticket Purchased!',
                message: 'Your ticket purchase has been broadcast. Your name will appear in the participants list once the transaction is confirmed.',
                txId: result.txId
            });

        } catch (err: any) {
            console.error('[BuyTicket] Purchase failed:', err);
            setWaitingWallet(false);
            setModal({
                isOpen: true,
                type: 'error',
                title: 'Purchase Failed',
                message: err.message || 'The wallet may have declined or timed out.'
            });
        } finally {
            setBuying(false);
        }
    };

    const handleDrawWinner = async () => {
        if (!id) return;
        setDrawing(true);
        setError(null);

        try {
            setWaitingWallet(true);
            const result = await signNanoContractTx({
                ncId: id,
                method: 'draw_winner',
                args: []
            });

            console.log('[DrawWinner] Transaction sent:', result);
            setWaitingWallet(false);

            // Track pending transaction
            addPendingTx(result.txId, 'draw', { lotteryId: id });
            setLastTxId(result.txId);

            setModal({
                isOpen: true,
                type: 'success',
                title: 'Winner Drawn!',
                message: 'The draw request has been sent. The result will be visible once the transaction is confirmed.',
                txId: result.txId
            });

        } catch (err: any) {
            console.error("Drawing winner failed:", err);
            setWaitingWallet(false);
            setModal({
                isOpen: true,
                type: 'error',
                title: 'Draw Failed',
                message: err.message || 'Failed to draw a winner. Please try again.'
            });
        } finally {
            setDrawing(false);
        }
    };

    const handleClaimReward = async () => {
        if (!id || !lottery || !address) return;
        setDrawing(true); // Reuse drawing state for loading indicator
        setError(null);

        try {
            // Determine payout amount based on role
            const isWinner = address.toLowerCase() === lottery.winner?.toLowerCase();
            const isCreator = address.toLowerCase() === lottery.creator.toLowerCase();

            let amountCents = 0;
            if (isWinner) amountCents += Math.floor(lottery.winner_payout * 100);
            if (isCreator) amountCents += Math.floor(lottery.creator_payout * 100);

            if (amountCents <= 0) {
                throw new Error("You have no pending rewards to claim for this lottery.");
            }

            console.log('[ClaimReward] Initiating claim...', {
                id,
                isWinner,
                isCreator,
                amountCents,
                address
            });

            setWaitingWallet(true);
            const result = await signNanoContractTx({
                ncId: id,
                method: 'claim_reward',
                args: [],
                actions: [
                    {
                        type: 'withdrawal',
                        token: '00',
                        amount: String(amountCents),
                        address: address
                    }
                ]
            });

            console.log('[ClaimReward] Transaction sent:', result);
            setWaitingWallet(false);

            // Track pending transaction
            addPendingTx(result.txId, 'claim', { lotteryId: id });
            setLastTxId(result.txId);

            setModal({
                isOpen: true,
                type: 'success',
                title: 'Reward Claimed!',
                message: `Your claim for ${HathorService.fromCents(amountCents)} HTR has been sent. It will arrive in your wallet once confirmed.`,
                txId: result.txId
            });

        } catch (err: any) {
            console.error("Claiming reward failed:", err);
            setWaitingWallet(false);
            setModal({
                isOpen: true,
                type: 'error',
                title: 'Claim Failed',
                message: err.message || 'The wallet may have declined or the request was invalid.'
            });
        } finally {
            setDrawing(false);
        }
    };

    const isOwner = !!(address && lottery?.creator &&
        address.toLowerCase() === lottery.creator.toLowerCase());

    const isWinner = !!(address && lottery?.winner &&
        address.toLowerCase() === lottery.winner.toLowerCase());

    const claimableAmount = (isWinner ? (lottery?.winner_payout ?? 0) : 0) +
        (isOwner ? (lottery?.creator_payout ?? 0) : 0);

    if (loading) {
        return (
            <div className="container">
                <div className="card animate-pulse" style={{ height: '400px' }}></div>
            </div>
        );
    }

    if (error && !lottery) {
        return (
            <div className="container">
                <Link to="/" className="icon-btn mb-6">
                    <svg className="icon" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Back to Dashboard
                </Link>
                <div className="card p-6">
                    <p className="text-secondary">Error: {error}</p>
                </div>
            </div>
        );
    }

    if (!lottery) {
        return (
            <div className="container">
                <Link to="/" className="icon-btn mb-6">
                    <svg className="icon" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Back to Dashboard
                </Link>
                <div className="card p-6">
                    <p className="text-secondary">Lottery not found</p>
                </div>
            </div>
        );
    }

    console.log('[LotteryDetail] Owner check:', {
        myAddress: address,
        creator: lottery.creator,
        isOwner,
        state: lottery.state,
        participants: lottery.participants.length
    });

    return (
        <>
            <Toast
                visible={waitingWallet}
                type="wallet"
                message="Please check your wallet to approve the transaction."
            />
            <Toast
                visible={!waitingWallet && (lastTxId ? isTxPending(lastTxId) : false)}
                type="pending"
                message="Transaction submitted. Waiting for blockchain confirmation..."
            />
            <div className="container page-shell detail-page">
                <Link to="/" className="icon-btn mb-6">
                    <svg className="icon" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Back to Dashboard
                </Link>

                {error && (
                    <div className="card p-4 mb-6" style={{ borderColor: '#ff4444' }}>
                        <p className="text-secondary">{error}</p>
                    </div>
                )}

                <div className="detail-layout grid gap-6">
                    {/* Contract Info */}
                    <div className="card detail-summary">
                        <div className="detail-hero flex justify-between items-start mb-6">
                            <div>
                                <div className={`badge mb-2 ${lottery.state === 'OPEN' ? 'badge-success' : 'badge-error'}`}>
                                    {lottery.state}
                                </div>
                                <h1 className="detail-title mb-1">{lottery.description}</h1>
                                <p className="tech-display text-secondary text-xs detail-id">ID: {id}</p>
                            </div>
                        </div>

                        <div className="stats-grid mb-6">
                            <div className="stat-item">
                                <div className="tech-label">Ticket Price</div>
                                <div className="tech-value text-xl">{lottery.price} HTR</div>
                            </div>
                            <div className="stat-item">
                                <div className="tech-label">Total Pool</div>
                                <div className="tech-value text-xl">{lottery.pot} HTR</div>
                            </div>
                            <div className="stat-item">
                                <div className="tech-label">Commission</div>
                                <div className="tech-value text-xl">{lottery.commission}%</div>
                            </div>
                            <div className="stat-item">
                                <div className="tech-label">Participants</div>
                                <div className="tech-value text-xl">{lottery.participants.length}</div>
                            </div>
                        </div>
                    </div>

                    {/* Actions Sidebar */}
                    <div className="detail-sidebar space-y-4">
                        <div className="card">
                            <h3 className="mb-4">Actions</h3>

                            {isTxPending(id || '') ? (
                                <div className="detail-status-card p-4 rounded text-center mb-4 animate-pulse">
                                    <p className="tech-label detail-status-label mb-1">Network Status</p>
                                    <p className="font-bold detail-status-value">WAITING CONFIRMATION</p>
                                </div>
                            ) : lottery.state === 'OPEN' ? (
                                <button
                                    onClick={handleBuyTicket}
                                    disabled={buying || !connected}
                                    className="btn-primary w-full mb-4"
                                >
                                    {buying ? 'Signing Transaction...' : `Buy Ticket (${lottery.price} HTR)`}
                                </button>
                            ) : (
                                <div className="space-y-4">
                                    <div className="detail-winner-card p-4 rounded text-center">
                                        <p className="tech-label mb-1">Winner</p>
                                        <p className="tech-value text-sm detail-address">{lottery.winner}</p>
                                    </div>

                                    {(address?.toLowerCase() === lottery.winner?.toLowerCase() || isOwner) && (
                                        <button
                                            onClick={handleClaimReward}
                                            disabled={drawing || !connected || claimableAmount <= 0}
                                            className="btn-primary w-full shadow-glow"
                                        >
                                            {drawing ? 'Processing...' : `Claim My Reward (${claimableAmount.toFixed(2)} HTR)`}
                                        </button>
                                    )}
                                </div>
                            )}

                            {!connected && (
                                <p className="text-xs text-secondary text-center">
                                    Connect wallet to participate
                                </p>
                            )}

                            {isOwner && lottery.state === 'OPEN' && (
                                <div className="mt-4 pt-4 border-t">
                                    <button
                                        onClick={handleDrawWinner}
                                        disabled={drawing || lottery.participants.length === 0}
                                        className="btn-secondary w-full"
                                        title={lottery.participants.length === 0 ? 'Need at least 1 participant' : ''}
                                    >
                                        {drawing ? 'Drawing...' : 'Draw Winner'}
                                    </button>
                                    {lottery.participants.length === 0 && (
                                        <p className="text-xs text-secondary text-center mt-2">
                                            Need at least 1 participant to draw
                                        </p>
                                    )}
                                </div>
                            )}

                            {lottery.state === 'CLOSED' && (payouts.winner || payouts.creator) && (
                                <div className="mt-4 pt-4 border-t">
                                    <h4 className="tech-label payout-label mb-3">Payout Transactions</h4>
                                    <div className="space-y-3">
                                        {payouts.winner && (
                                            <div className="payout-card payout-card--winner p-4 rounded">
                                                <div className="payout-card-header flex justify-between items-center mb-1">
                                                    <span className="payout-card-title">Winner Payout</span>
                                                    <a
                                                        href={`https://explorer.hathor.network/transaction/${payouts.winner}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="payout-card-link"
                                                    >
                                                        VIEW TX
                                                    </a>
                                                </div>
                                                <p className="tech-display payout-card-hash">{payouts.winner}</p>
                                            </div>
                                        )}
                                        {payouts.creator && (
                                            <div className="payout-card payout-card--creator p-4 rounded">
                                                <div className="payout-card-header flex justify-between items-center mb-1">
                                                    <span className="payout-card-title">Creator Fee (10 HTR + Comm)</span>
                                                    <a
                                                        href={`https://explorer.hathor.network/transaction/${payouts.creator}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="payout-card-link"
                                                    >
                                                        VIEW TX
                                                    </a>
                                                </div>
                                                <p className="tech-display payout-card-hash">{payouts.creator}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="card">
                            <h3 className="tech-label text-xs mb-3">Contract Info</h3>
                            <div className="space-y-2 text-xs text-secondary contract-meta">
                                <div className="flex justify-between">
                                    <span>Creator Fee:</span>
                                    <span>{lottery.commission}%</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Network:</span>
                                    <span>Hathor Localnet</span>
                                </div>
                                <div className="flex flex-col gap-1 mt-2 pt-4 border-t">
                                    <span className="flex justify-between items-center">
                                        <span>Creator:</span>
                                        {isOwner && <span className="badge badge-success text-xs">You</span>}
                                    </span>
                                    <span className="tech-display text-xs detail-address">
                                        {lottery.creator || '(not set)'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <NotificationModal
                    {...modal}
                    onClose={() => setModal(prev => ({ ...prev, isOpen: false }))}
                />
            </div >
        </>
    );
};

export default LotteryDetail;
