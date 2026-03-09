type HathorNetworkKey = 'localnet' | 'testnet';

interface HathorNetworkConfig {
    key: HathorNetworkKey;
    chainId: `hathor:${string}`;
    name: string;
    rpc: string;
}

const NETWORKS: Record<HathorNetworkKey, HathorNetworkConfig> = {
    localnet: {
        key: 'localnet',
        chainId: 'hathor:privatenet',
        name: 'Hathor Privatenet',
        rpc: 'https://node.localnet.hathor.works/v1a/',
    },
    testnet: {
        key: 'testnet',
        chainId: 'hathor:testnet',
        name: 'Hathor Testnet',
        rpc: 'https://node1.testnet.hathor.network/v1a/',
    },
};

const configuredNetwork = String(import.meta.env.VITE_HATHOR_NETWORK || 'localnet').toLowerCase();
const activeNetworkKey: HathorNetworkKey = configuredNetwork === 'testnet' ? 'testnet' : 'localnet';

export const ACTIVE_HATHOR_NETWORK = {
    ...NETWORKS[activeNetworkKey],
    rpc: import.meta.env.VITE_HATHOR_NODE_URL || NETWORKS[activeNetworkKey].rpc,
};

export const ACTIVE_STORAGE_SCOPE = `${ACTIVE_HATHOR_NETWORK.key}:${import.meta.env.VITE_LOTTERY_BLUEPRINT_ID || 'unconfigured'}`;
