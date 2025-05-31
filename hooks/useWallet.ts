import { useAccount, useChainId, useBalance, useSignMessage, useSignTypedData } from 'wagmi';

export interface WalletInfo {
  address: string;
  isConnected: boolean;
  chainId: number;
  balance?: string;
}

export function useWallet() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { data: balanceData } = useBalance({
    address: address,
    query: {
      enabled: isConnected,
    },
  });
  
  const { signMessageAsync } = useSignMessage();
  const { signTypedDataAsync } = useSignTypedData();

  const getWalletInfo = (): WalletInfo | null => {
    if (!isConnected || !address) {
      return { address: '', isConnected: false, chainId: 0 };
    }

    return {
      address,
      isConnected,
      chainId,
      balance: balanceData?.formatted
    };
  };

  const signMessage = async (message: string) => {
    if (!isConnected) {
      throw new Error('No wallet connected');
    }
    return signMessageAsync({ message });
  };

  const signTypedData = async (domain: any, types: any, value: any) => {
    if (!isConnected) {
      throw new Error('No wallet connected');
    }
    return signTypedDataAsync({ domain, types, primaryType: Object.keys(types)[0], message: value });
  };

  return {
    isWalletAvailable: () => true, // With RainbowKit, we assume a wallet is always available
    connectWallet: () => ({}), // Connection is handled by RainbowKit's ConnectButton
    getWalletInfo,
    signMessage,
    signTypedData,
    getSigner: () => null, // Not needed with RainbowKit/Wagmi
    getProvider: () => null, // Not needed with RainbowKit/Wagmi
    disconnect: () => {}, // Disconnection is handled by RainbowKit
  };
}
