import { Stack } from 'expo-router';

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