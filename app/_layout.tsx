import { Stack } from 'expo-router';

if (process.env.EXPO_OS === 'web') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../global.css');
}

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Màn hình Login hiện đầu tiên và không có Tab */}
      <Stack.Screen name="login" /> 
      
      {/* Nhóm các màn hình có Tab (Home, Settings...) */}
      <Stack.Screen name="(tabs)" /> 
    </Stack>
  );
}