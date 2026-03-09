import React, { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { Link, useNavigate } from 'react-router-dom';
import { HathorService } from '../services/hathor';
import NotificationModal from '../components/NotificationModal';
import type { NotificationType } from '../components/NotificationModal';
import { usePendingTxs } from '../contexts/PendingTxContext';
import Toast from '../components/Toast';

// The blueprint ID of your deployed lottery contract
const LOTTERY_BLUEPRINT_ID = import.meta.env.VITE_LOTTERY_BLUEPRINT_ID || '';

const CreateLottery: React.FC = () => {
    const { connected, signNanoContractTx } = useWallet();
    const navigate = useNavigate();

    const [description, setDescription] = useState('');
    const [price, setPrice] = useState('');
    const [commission, setCommission] = useState('5');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { addPendingTx, isTxPending } = usePendingTxs();
    const [waitingWallet, setWaitingWallet] = useState(false);
    const [lastTxId, setLastTxId] = useState<string | null>(null);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!connected) {
            setError("Please connect your wallet first");
            return;
        }

        if (!LOTTERY_BLUEPRINT_ID) {
            setError("VITE_LOTTERY_BLUEPRINT_ID is not configured. Deploy a lottery blueprint first.");
            return;
        }

        if (!description || !price || !commission) {
            setError("Please fill in all fields");
            return;
        }

        setLoading(true);

        try {
            const priceInCents = HathorService.toCents(parseFloat(price));
            const commissionValue = parseInt(commission);

            // Create new lottery contract via WalletConnect
            setWaitingWallet(true);
            const result = await signNanoContractTx({
                blueprintId: LOTTERY_BLUEPRINT_ID,
                method: 'initialize',
                args: [
                    description,           // description
                    priceInCents,          // item_price (in cents)
                    commissionValue        // commission percentage
                ],
                actions: [
                    {
                        type: 'deposit',
                        token: '00',
                        amount: 1000
                    }
                ]
            });

            console.log("Lottery created:", result.txId);

            // Add to pending tracking
            addPendingTx(result.txId, 'create', { description });
            setLastTxId(result.txId);
            setWaitingWallet(false);

            setModal({
                isOpen: true,
                type: 'success',
                title: 'Lottery Launched!',
                message: 'Your lottery transaction has been broadcast. It will appear on the dashboard in a "Confirming" state while the network processes it.',
                txId: result.txId
            });

        } catch (err: any) {
            console.error("Failed to create lottery:", err);
            setWaitingWallet(false);
            setModal({
                isOpen: true,
                type: 'error',
                title: 'Launch Failed',
                message: err.message || "We couldn't broadcast your lottery transaction. Please check your wallet and try again."
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Toast
                visible={waitingWallet}
                type="wallet"
                message="Please approve the 10 HTR lottery creation fee in your wallet."
            />
            <Toast
                visible={!waitingWallet && (lastTxId ? isTxPending(lastTxId) : false)}
                type="pending"
                message="Lottery creation submitted. Waiting for confirmation..."
            />
            <div className="container" style={{ maxWidth: '600px' }}>
                <Link to="/" className="icon-btn mb-6">
                    <svg className="icon" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Back to Dashboard
                </Link>

                <h1>Launch New Lottery</h1>
                <p className="text-secondary mb-6">
                    Launch a new prize pool on the network. A mandatory 10 HTR creation fee applies, which you can claim back later along with your commissions.
                </p>

                {error && (
                    <div className="card p-4 mb-6" style={{ borderColor: '#ff4444' }}>
                        <p className="text-secondary">{error}</p>
                    </div>
                )}

                {!LOTTERY_BLUEPRINT_ID && (
                    <div className="card p-4 mb-6 border-dashed">
                        <p className="tech-label mb-2">Configuration Required</p>
                        <p className="text-secondary text-sm">
                            Set VITE_LOTTERY_BLUEPRINT_ID in your .env file to the ID of your deployed lottery blueprint.
                        </p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="card">
                    <div className="form-group">
                        <label htmlFor="description">Lottery Name / Description</label>
                        <input
                            id="description"
                            type="text"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="e.g., Community Jackpot #1"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="price">Ticket Price (HTR)</label>
                        <input
                            id="price"
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="e.g., 10.00"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="commission">Creator Commission (%)</label>
                        <input
                            id="commission"
                            type="number"
                            min="0"
                            max="50"
                            value={commission}
                            onChange={(e) => setCommission(e.target.value)}
                            placeholder="e.g., 5"
                            required
                        />
                        <p className="text-secondary text-xs mt-1">
                            The percentage you receive from the pot when a winner is drawn (max 50%)
                        </p>
                    </div>

                    <button
                        type="submit"
                        className="btn-primary w-full mt-4"
                        disabled={loading || !connected}
                    >
                        {loading ? 'Creating Lottery...' : 'Create Lottery (10 HTR)'}
                    </button>

                    {!connected && (
                        <p className="text-xs text-secondary text-center mt-4">
                            Connect your wallet to create a lottery
                        </p>
                    )}
                </form>

                <NotificationModal
                    {...modal}
                    onClose={() => {
                        setModal(prev => ({ ...prev, isOpen: false }));
                        if (modal.type === 'success') navigate('/');
                    }}
                />
            </div>
        </>
    );
};

export default CreateLottery;
