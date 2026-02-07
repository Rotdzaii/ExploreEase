import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../src/services/supabase';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [hasProfile, setHasProfile] = useState(false);

  useEffect(() => {
    const checkProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single();

      if (!error && data?.full_name) setHasProfile(true);
      else setHasProfile(false);

      setLoading(false);
    };

    // Initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkProfile(session.user.id);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkProfile(session.user.id);
      else {
        setHasProfile(false);
        setLoading(false);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  if (loading) return <View style={{flex:1, justifyContent:'center'}}><ActivityIndicator size="large" color="#0d7ff2"/></View>;

  if (!session) return <Redirect href="./login" />;
  if (!hasProfile) return <Redirect href="./profile-setup" />;

  return <Redirect href={'/(tabs)/explore' as any} />;
}