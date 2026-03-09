import React, { useState, useCallback, createContext, useContext, useEffect } from 'react';
import { WalletConnectService } from '../services/walletconnect';

interface WalletContextType {
    connected: boolean;
    address: string | null;
    balance: number;
    connecting: boolean;
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    error: string | null;
    signNanoContractTx: (txData: any) => Promise<{ txId: string }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [connected, setConnected] = useState(false);
    const [address, setAddress] = useState<string | null>(null);
    const [balance, setBalance] = useState(0);
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Check for existing session on mount
    useEffect(() => {
        const checkExistingSession = async () => {
            try {
                const client = await WalletConnectService.init();
                const sessions = client.session.getAll();
                console.log('[Wallet] Found sessions:', sessions.length);
                if (sessions.length > 0) {
                    const lastSession = sessions[sessions.length - 1];
                    // IMPORTANT: Restore the session in the service module
                    WalletConnectService.setCurrentSession(lastSession);
                    const addr = WalletConnectService.getAddressFromSession(lastSession);
                    console.log('[Wallet] Restored address:', addr);
                    if (addr) {
                        setAddress(addr);
                        setConnected(true);
                        // Fetch balance
                        try {
                            const bal = await WalletConnectService.getBalance();
                            setBalance(bal.available / 100); // Convert from cents
                        } catch (e) {
                            console.log('[Wallet] Balance fetch failed:', e);
                            setBalance(0);
                        }
                    }
                }
            } catch (err) {
                console.error('Error checking existing session:', err);
            }
        };
        checkExistingSession();
    }, []);

    const connect = async () => {
        try {
            setError(null);
            setConnecting(true);
            console.log("Connecting via WalletConnect...");

            const { address: walletAddress } = await WalletConnectService.connect();

            // Close modal on successful connection
            WalletConnectService.closeModal();

            setAddress(walletAddress);
            setConnected(true);

            // Fetch balance
            try {
                const bal = await WalletConnectService.getBalance();
                setBalance(bal.available / 100);
            } catch {
                setBalance(0);
            }

            console.log("Connected!", walletAddress);

        } catch (err: any) {
            console.error('Connection error:', err);
            setError(err.message || 'Failed to connect');
            WalletConnectService.closeModal();
        } finally {
            setConnecting(false);
        }
    };

    const disconnect = useCallback(async () => {
        try {
            await WalletConnectService.disconnect();
        } catch (err) {
            console.error('Disconnect error:', err);
        }
        setConnected(false);
        setAddress(null);
        setBalance(0);
    }, []);

    const signNanoContractTx = async (txData: any): Promise<{ txId: string }> => {
        if (!connected) {
            throw new Error('Wallet not connected');
        }
        return await WalletConnectService.signNanoContractTx(txData);
    };

    return (
        <WalletContext.Provider value={{
            connected,
            address,
            balance,
            connecting,
            connect,
            disconnect,
            error,
            signNanoContractTx
        }}>
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = () => {
    const context = useContext(WalletContext);
    if (!context) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};
