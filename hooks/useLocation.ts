import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

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

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });

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
