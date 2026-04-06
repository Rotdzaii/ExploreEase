import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

export type GeoCoords = {
  latitude: number;
  longitude: number;
};

export function useLocation(): {
  location: GeoCoords | null;
  errorMsg: string | null;
  isLoading: boolean;
} {
  const [location, setLocation] = useState<GeoCoords | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        setLocation(null);
        setErrorMsg('Bạn đã từ chối quyền định vị. Bật GPS để xem khoảng cách.');
        return;
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setLocation(null);
        setErrorMsg('Dịch vụ định vị đang tắt. Vui lòng bật GPS để lấy vị trí chính xác.');
        return;
      }

      if (Platform.OS === 'android') {
        try {
          // Ask Android to use high-accuracy provider (GPS + sensors) instead of coarse network only.
          await Location.enableNetworkProviderAsync();
        } catch {
          // Ignore and continue with explicit high accuracy options below.
        }
      }

      let pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        mayShowUserSettingsDialog: true,
      });

      const horizontalAccuracy = Number(pos.coords.accuracy ?? NaN);
      if (!Number.isFinite(horizontalAccuracy) || horizontalAccuracy > 120) {
        // Retry once to improve GPS lock if the first fix is still too coarse.
        pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Highest,
          mayShowUserSettingsDialog: true,
        });
      }

      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      setErrorMsg(null);
    } catch (e: any) {
      setLocation(null);
      setErrorMsg(e?.message ?? String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { location, errorMsg, isLoading };
}
