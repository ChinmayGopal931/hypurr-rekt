// src/providers.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
import { config } from '@/lib/wagmi';
import { ReactNode, useState } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Global defaults optimized for trading app
        staleTime: 1000 * 30, // 30 seconds default stale time
        gcTime: 1000 * 60 * 5, // 5 minutes garbage collection
        refetchOnWindowFocus: true, // Important for trading apps
        refetchOnReconnect: true,
        retry: (failureCount, error: Error) => {
          // Don't retry on 4xx errors, do retry on network errors
          if ('status' in error && typeof error.status === 'number' && error.status >= 400 && error.status < 500) {
            return false;
          }
          return failureCount < 3;
        },
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
        networkMode: 'online', // Only fetch when online
      },
      mutations: {
        // Mutations for order placement, cancellation
        retry: false, // Don't retry mutations automatically - trading should be explicit
        networkMode: 'online',
        onError: (error) => {
          console.error('Mutation failed:', error);
        },
      },
    },
  }));

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          {children}
          {/* Only show devtools in development */}
          {process.env.NODE_ENV === 'development' && (
            <ReactQueryDevtools
              initialIsOpen={false}
            />
          )}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}