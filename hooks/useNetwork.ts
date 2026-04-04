import NetInfo, { type NetInfoState, type NetInfoStateType } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export type NetworkStateSnapshot = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: NetInfoStateType;
  isOnline: boolean;
  isOffline: boolean;
};

const UNKNOWN_NETWORK_TYPE = 'unknown' as NetInfoStateType;

const toSnapshot = (state: NetInfoState): NetworkStateSnapshot => {
  const isConnected = state.isConnected;
  const isInternetReachable = state.isInternetReachable;
  const isOnline = isConnected !== false && isInternetReachable !== false;

  return {
    isConnected,
    isInternetReachable,
    type: state.type ?? UNKNOWN_NETWORK_TYPE,
    isOnline,
    isOffline: !isOnline,
  };
};

const initialSnapshot: NetworkStateSnapshot = {
  isConnected: null,
  isInternetReachable: null,
  type: UNKNOWN_NETWORK_TYPE,
  isOnline: true,
  isOffline: false,
};

export function useNetwork() {
  const [network, setNetwork] = useState<NetworkStateSnapshot>(initialSnapshot);

  useEffect(() => {
    let mounted = true;

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!mounted) return;
      setNetwork(toSnapshot(state));
    });

    NetInfo.fetch()
      .then((state) => {
        if (!mounted) return;
        setNetwork(toSnapshot(state));
      })
      .catch(() => {
        // Keep current snapshot when fetch fails.
      });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return network;
}
