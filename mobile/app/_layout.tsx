import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/store/auth';
import SplashScreen from '@/screens/SplashScreen';
import ConsentGateScreen from '@/screens/ConsentGateScreen';
import ConsentUnavailableScreen from '@/screens/ConsentUnavailableScreen';
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
  const { bootstrapping, isAuthenticated, consentStatus, consentCheckFailed } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (bootstrapping) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/welcome');
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

  // Consent safe mode (Stage 10B): a failed /legal/consent-status fetch
  // (network/timeout/5xx) must NEVER be treated as "consent confirmed" — this
  // used to fail OPEN into the normal app. Now it shows a distinct limited
  // screen (Retry / view legal docs / logout) instead of either the normal
  // app or the accept-policies gate below, which only renders on a CONFIRMED
  // backend response saying policies are missing.
  if (isAuthenticated && consentCheckFailed) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ConsentUnavailableScreen />
      </View>
    );
  }

  // Proactive consent gate (Stage 10A): block the normal app for an
  // authenticated user until required policies (Terms/Privacy/Risk) are
  // accepted, per backend /legal/consent-status. The backend's own
  // requireLegalConsent middleware remains the real enforcement layer on
  // every gated financial action regardless of this client-side gate.
  if (isAuthenticated && consentStatus?.enforced && !consentStatus.upToDate) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ConsentGateScreen />
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
      <Stack.Screen name="legal" options={{ title: 'Legal & Policies' }} />
      <Stack.Screen name="support" options={{ title: 'Support' }} />
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
