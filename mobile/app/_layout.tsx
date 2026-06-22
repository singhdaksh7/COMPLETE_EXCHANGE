import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/store/auth';
import SplashScreen from '@/screens/SplashScreen';
import { colors } from '@/theme';

const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.bg },
  headerTintColor: colors.brand,
  headerTitleStyle: { color: colors.ink },
  contentStyle: { backgroundColor: colors.bg },
} as const;

/**
 * Auth gate: once bootstrapped, push unauthenticated users to the (auth) group
 * and authenticated users out of it. Everything outside (auth) requires a session.
 */
function RootNavigator() {
  const { bootstrapping, isAuthenticated } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (bootstrapping) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [bootstrapping, isAuthenticated, segments, router]);

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SplashScreen />
      </View>
    );
  }

  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="market/[symbol]" options={{ title: 'Market' }} />
      <Stack.Screen name="trade" options={{ title: 'Trade' }} />
      <Stack.Screen name="orders" options={{ title: 'Orders' }} />
      <Stack.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Stack.Screen name="deposit" options={{ title: 'Deposit' }} />
      <Stack.Screen name="withdraw" options={{ title: 'Withdraw' }} />
      <Stack.Screen name="kyc" options={{ title: 'KYC Status' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Stack.Screen name="security" options={{ title: 'Security' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
