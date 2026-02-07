import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { supabase } from '../services/supabase';

import LoginScreen from '../screens/LoginScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import InterestsScreen from '../screens/InterestsScreen';
import HomeScreen from '../screens/HomeScreen'; // Tạo một file Home tạm thời

const Stack = createStackNavigator();

export default function AppNavigator() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    // 1. Kiểm tra phiên hiện tại khi mở App
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthState(session);
    });

    // 2. Lắng nghe thay đổi trạng thái đăng nhập
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleAuthState(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthState = async (session) => {
    setSession(session);
    if (session) {
      // Kiểm tra xem đã có dữ liệu trong bảng profiles chưa
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.user.id)
        .single();
      
      if (data?.full_name) setHasProfile(true);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#0d7ff2" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : !hasProfile ? (
          <>
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen name="Interests" component={InterestsScreen} />
          </>
        ) : (
          <Stack.Screen name="Home" component={HomeScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}