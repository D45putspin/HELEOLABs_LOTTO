import SignClient from '@walletconnect/sign-client';
import { sendNanoContractTxRpcRequest } from '@hathor/hathor-rpc-handler';
import { WalletConnectModal } from '@walletconnect/modal';
import { ACTIVE_HATHOR_NETWORK } from '../config/network';

export const HATHOR_LOCALNET = {
    chainId: 'hathor:privatenet',
    name: 'Hathor Privatenet',
    rpc: 'https://node.localnet.hathor.works/v1a/'
};

export const HATHOR_TESTNET = {
    chainId: 'hathor:testnet',
    name: 'Hathor Testnet',
    rpc: 'https://node1.testnet.hathor.network/v1a/'
};

// WalletConnect Project ID - Get yours at https://cloud.walletconnect.com
const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'YOUR_PROJECT_ID';
const HATHOR_WALLET_DEEP_LINK_SCHEME = 'hathorwallet';

// Required methods for Hathor wallet - match pXiel exactly
const REQUIRED_METHODS = ['htr_signWithAddress', 'htr_sendNanoContractTx'];
const OPTIONAL_METHODS = ['htr_createToken', 'htr_sendTransaction'];

export interface WalletConnectState {
    client: SignClient | null;
    session: any | null;
    address: string | null;
    connected: boolean;
}

type GlobalWcStore = typeof globalThis & {
    __lotteryWcClient?: SignClient | null;
    __lotteryWcSession?: any | null;
    __lotteryWcModal?: WalletConnectModal | null;
};

const globalWcStore = globalThis as GlobalWcStore;

let signClient: SignClient | null = globalWcStore.__lotteryWcClient || null;
let currentSession: any = globalWcStore.__lotteryWcSession || null;
let wcModal: WalletConnectModal | null = globalWcStore.__lotteryWcModal || null;

const syncGlobalWcStore = () => {
    globalWcStore.__lotteryWcClient = signClient;
    globalWcStore.__lotteryWcSession = currentSession;
    globalWcStore.__lotteryWcModal = wcModal;
};

const isMobileWalletConnectFlow = () => {
    if (typeof window === 'undefined') return false;

    return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent);
};

const formatRpcDebugPayload = (value: unknown): string | unknown => {
    try {
        return JSON.stringify(
            value,
            (_key, innerValue) => typeof innerValue === 'bigint' ? `${innerValue.toString()}n` : innerValue,
            2
        );
    } catch {
        return value;
    }
};

const normalizeTxIdCandidate = (value: unknown): string | null => {
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    return null;
};

const extractTxId = (response: any): string | null => {
    const candidates = [
        response?.hash,
        response?.txId,
        response?.response?.hash,
        response?.response?.txId,
        response?.transaction?.hash,
        response?.response?.transaction?.hash,
        response?.transaction,
        response?.response?.transaction,
        response
    ];

    for (const candidate of candidates) {
        const txId = normalizeTxIdCandidate(candidate);
        if (txId) {
            return txId;
        }
    }

    return null;
};

export const openHathorWalletDeepLink = (wcUri: string) => {
    if (typeof window === 'undefined') return;

    const deepLink = `${HATHOR_WALLET_DEEP_LINK_SCHEME}://wc?uri=${encodeURIComponent(wcUri)}`;
    window.open(deepLink, '_self');
};

export const WalletConnectService = {
    /**
     * Initialize the WalletConnect Sign Client and Modal
     */
    async init(): Promise<SignClient> {
        if (signClient) return signClient;

        // Initialize the WalletConnectModal - like pXiel does
        const modalConfig = {
            projectId: PROJECT_ID,
            walletConnectVersion: 2,
            standaloneChains: [ACTIVE_HATHOR_NETWORK.chainId]
        } as unknown as ConstructorParameters<typeof WalletConnectModal>[0];
        wcModal = new WalletConnectModal(modalConfig);

        signClient = await SignClient.init({
            projectId: PROJECT_ID,
            relayUrl: 'wss://relay.reown.com',
            metadata: {
                name: 'Heleolabs Lotto',
                description: `Heleolabs Lotto on ${ACTIVE_HATHOR_NETWORK.name}`,
                url: window.location.origin,
                icons: ['https://walletconnect.com/walletconnect-logo.png'] // Match pXiel's remote icon
            }
        });

        // Setup event handlers
        signClient.on('session_update', ({ topic, params }) => {
            const updated = signClient?.session.get(topic);
            if (updated) {
                currentSession = { ...updated, namespaces: params?.namespaces || updated.namespaces };
                syncGlobalWcStore();
            }
        });

        signClient.on('session_delete', () => {
            console.log('Session deleted');
            currentSession = null;
            syncGlobalWcStore();
        });

        signClient.on('session_expire', () => {
            console.log('Session expired');
            currentSession = null;
            syncGlobalWcStore();
        });

        syncGlobalWcStore();
        return signClient;
    },

    /**
     * Connect to wallet via WalletConnect
     */
    async connect(): Promise<{ address: string; session: any }> {
        const client = await this.init();

        // Check for existing sessions - but validate they have proper methods
        const lastSession = client.session.getAll().pop();
        if (lastSession) {
            // Check if the session has the required htr_sendNanoContractTx method
            const methods = lastSession.namespaces?.hathor?.methods || [];
            if (methods.includes('htr_sendNanoContractTx')) {
                currentSession = lastSession;
                syncGlobalWcStore();
                const address = this.getAddressFromSession(lastSession);
                console.log('[WC] Restored valid session with methods:', methods);
                return { address, session: lastSession };
            } else {
                // Session is stale, disconnect it and create new one
                console.log('[WC] Stale session found (missing methods), disconnecting...', methods);
                try {
                    await client.disconnect({
                        topic: lastSession.topic,
                        reason: { code: 6000, message: 'Session missing required methods' }
                    });
                } catch (e) {
                    console.log('[WC] Failed to disconnect stale session:', e);
                }
            }
        }

        // Create new session - use pXiel's simple requiredNamespaces pattern
        const requestedMethods = Array.from(new Set([...REQUIRED_METHODS, ...OPTIONAL_METHODS]));
        const requiredNamespaces = {
            hathor: {
                methods: requestedMethods,
                chains: [ACTIVE_HATHOR_NETWORK.chainId],
                events: [],
            },
        };

        const { uri, approval } = await client.connect({
            requiredNamespaces,
        });

        // Use the official WalletConnectModal
        if (uri && wcModal) {
            console.log('[WC] Opening modal with URI');
            wcModal.openModal({ uri, standaloneChains: requiredNamespaces.hathor.chains });

            if (isMobileWalletConnectFlow()) {
                openHathorWalletDeepLink(uri);
            }
        }

        try {
            // Wait for wallet approval
            const session = await approval();
            currentSession = session;
            syncGlobalWcStore();
            console.log('[WC] Session approved:', session.namespaces);

            const address = this.getAddressFromSession(session);
            return { address, session };
        } finally {
            // Always close the modal
            wcModal?.closeModal?.();
        }
    },

    /**
     * Disconnect current session
     */
    async disconnect(): Promise<void> {
        if (!signClient || !currentSession) return;

        await signClient.disconnect({
            topic: currentSession.topic,
            reason: { code: 6000, message: 'User disconnected' }
        });
        currentSession = null;
        syncGlobalWcStore();
    },

    /**
     * Extract address from session
     */
    getAddressFromSession(session: any): string {
        const namespaces = session.namespaces || {};
        const hathor = namespaces.hathor || namespaces.htr || {};
        const accounts = hathor.accounts || [];

        console.log('[WC] Session accounts:', accounts);
        if (accounts.length > 0) {
            // Format: "hathor:privatenet:HAddress..."
            const parts = accounts[0].split(':');
            return parts[parts.length - 1];
        }
        return '';
    },

    /**
     * Set/restore the current session (for session recovery)
     */
    setCurrentSession(session: any): void {
        currentSession = session;
        syncGlobalWcStore();
        console.log('[WC] Session restored:', session?.topic);
    },

    restoreSession(): void {
        if (!signClient) return;
        const lastSession = signClient.session.getAll().pop();
        if (lastSession) {
            currentSession = lastSession;
            syncGlobalWcStore();
        }
    },

    /**
     * Get the active chain ID from session
     */
    getChainFromSession(session: any): string {
        const namespaces = session?.namespaces || {};
        const hathor = namespaces.hathor || namespaces.htr || {};
        const accounts = hathor.accounts || [];
        if (accounts.length > 0) {
            const parts = accounts[0].split(':');
            return `${parts[0]}:${parts[1]}`;
        }
        return ACTIVE_HATHOR_NETWORK.chainId;
    },

    /**
     * Send a JSON-RPC request to the wallet
     */
    async request<T>(method: string, params: any): Promise<T> {
        if (!signClient || !currentSession) {
            this.restoreSession();
        }
        if (!signClient || !currentSession) {
            throw new Error('Not connected to wallet');
        }

        const chainId = this.getChainFromSession(currentSession);
        console.log(`[WC] Sending ${method} to ${chainId}`);

        return await signClient.request({
            topic: currentSession.topic,
            chainId,
            request: {
                method,
                params
            }
        });
    },

    /**
     * Send a Nano Contract transaction
     */
    async signNanoContractTx(txData: {
        ncId?: string;
        blueprintId?: string;
        method: string;
        args: any[];
        actions?: any[];
    }): Promise<{ txId: string }> {
        // Get blueprint ID from env if not provided
        const blueprintId = txData.blueprintId || import.meta.env.VITE_LOTTERY_BLUEPRINT_ID || '';

        // Use the helper to build properly formatted RPC request
        const rpcRequest = sendNanoContractTxRpcRequest(
            txData.method,
            blueprintId,
            txData.actions || [],
            txData.args || [],
            true,  // pushTx - broadcast the transaction
            txData.ncId || null
        );

        // Add network to params based on active session
        const chainId = this.getChainFromSession(currentSession);
        const network = chainId.split(':')[1] || ACTIVE_HATHOR_NETWORK.chainId.split(':')[1];
        const paramsWithNetwork = {
            ...rpcRequest.params,
            network,
        };

        console.log('[WC] RPC Params:', formatRpcDebugPayload(paramsWithNetwork));

        let response: any;
        try {
            response = await this.request(rpcRequest.method, paramsWithNetwork);
        } catch (error: any) {
            if (error?.message?.includes('No matching key') || error?.message?.includes('history')) {
                console.warn('[WC] Request history missing. Try reconnecting the wallet and retrying.');
            }
            throw error;
        }
        console.log('[WC] Wallet Response:', formatRpcDebugPayload(response));

        // Robustly extract transaction ID from various possible response formats
        // Some wallets/versions return hash, some txId, some nest it in 'response'
        const txId = extractTxId(response);

        console.log('[WC] Extracted txId:', txId);

        return { txId: txId || '' };
    },

    /**
     * Get wallet balance
     */
    async getBalance(): Promise<{ available: number; locked: number }> {
        return await this.request('htr_getBalance', {});
    },

    /**
     * Get current address
     */
    async getAddress(): Promise<string> {
        return await this.request('htr_getAddress', {});
    },

    /**
     * Open wallet connection modal/deeplink
     */
    openWalletConnectModal(uri: string): void {
        // Create a simple modal with QR code
        const modal = document.createElement('div');
        modal.id = 'wc-modal';
        modal.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
            ">
                <div style="
                    background: #111;
                    padding: 2rem;
                    border-radius: 12px;
                    border: 1px solid #333;
                    text-align: center;
                    max-width: 400px;
                ">
                    <h2 style="color: white; margin-bottom: 1rem;">Connect Wallet</h2>
                    <p style="color: #888; margin-bottom: 1.5rem;">
                        Scan this QR code with your Hathor Wallet app
                    </p>
                    <div id="qr-container" style="
                        background: white;
                        padding: 1rem;
                        border-radius: 8px;
                        display: inline-block;
                        margin-bottom: 1.5rem;
                    "></div>
                    <p style="color: #666; font-size: 0.75rem; word-break: break-all; margin-bottom: 1rem;">
                        ${uri.substring(0, 50)}...
                    </p>
                    <button id="wc-copy" style="
                        background: #333;
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 4px;
                        cursor: pointer;
                        margin-right: 0.5rem;
                    ">Copy Link</button>
                    <button id="wc-close" style="
                        background: transparent;
                        color: #888;
                        border: 1px solid #444;
                        padding: 0.75rem 1.5rem;
                        border-radius: 4px;
                        cursor: pointer;
                    ">Cancel</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Generate QR code using dynamic imports (ES module compatible)
        Promise.all([
            import('qrcode.react'),
            import('react'),
            import('react-dom/client')
        ]).then(([qrModule, React, ReactDOM]) => {
            const container = document.getElementById('qr-container');
            if (container) {
                const root = ReactDOM.createRoot(container);
                root.render(React.createElement(qrModule.QRCodeSVG, { value: uri, size: 200 }));
            }
        });

        // Event handlers
        document.getElementById('wc-copy')?.addEventListener('click', () => {
            navigator.clipboard.writeText(uri);
            alert('Copied to clipboard!');
        });

        document.getElementById('wc-close')?.addEventListener('click', () => {
            modal.remove();
        });
    },

    /**
     * Close the WalletConnect modal
     */
    closeModal(): void {
        wcModal?.closeModal?.();
        document.getElementById('wc-modal')?.remove();
    },

    /**
     * Check if currently connected
     */
    isConnected(): boolean {
        return !!currentSession;
    },

    /**
     * Get current session
     */
    getSession(): any {
        return currentSession;
    }
};
