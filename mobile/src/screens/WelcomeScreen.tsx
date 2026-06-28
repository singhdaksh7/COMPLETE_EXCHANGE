import React, { useRef, useState } from 'react';
import { Dimensions, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppBackground, BrandMark } from '@/components/premium';
import { colors, font, spacing, radius, cardShadow } from '@/theme';

const { width } = Dimensions.get('window');
const goldGradient = ['#F8DE8A', '#F5C242', '#D99A2B'] as const;

function Slide1Graphic() {
  return (
    <View style={styles.deviceContainer}>
      <View style={[styles.deviceFrame, { transform: [{ rotate: '-6deg' }] }, cardShadow]}>
        {/* Notch */}
        <View style={styles.deviceNotch} />
        {/* Screen Header */}
        <View style={styles.deviceScreenHeader}>
          <BrandMark size="sm" showWordmark={false} />
          <View style={{ gap: 2 }}>
            <Text style={styles.deviceScreenTitle}>EXORA</Text>
            <Text style={styles.deviceScreenSub}>India Pvt. Ltd.</Text>
          </View>
        </View>

        {/* Watchlist Header */}
        <Text style={styles.watchlistTitle}>Watchlist</Text>
        
        {/* Bitcoin Watcher Row */}
        <View style={styles.deviceRow}>
          <View style={[styles.coinIcon, { backgroundColor: 'rgba(245,194,66,0.12)' }]}>
            <Text style={[styles.coinSymbol, { color: colors.brand }]}>₿</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coinName}>Bitcoin</Text>
            <Text style={styles.coinQty}>Tba / k</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.coinPrice}>Price unavailable</Text>
            <Text style={[styles.coinChange, { color: colors.up }]}>▲ 2.45%</Text>
          </View>
        </View>

        {/* Ethereum Watcher Row */}
        <View style={styles.deviceRow}>
          <View style={[styles.coinIcon, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
            <Text style={[styles.coinSymbol, { color: '#3B82F6' }]}>Ξ</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.coinName}>Ethereum</Text>
            <Text style={styles.coinQty}>Tba / k</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.coinPrice}>Price unavailable</Text>
            <Text style={[styles.coinChange, { color: colors.up }]}>▲ 1.89%</Text>
          </View>
        </View>

        {/* Mini Tabbar */}
        <View style={styles.deviceTabBar}>
          <Ionicons name="home" size={13} color={colors.brand} />
          <Ionicons name="stats-chart" size={13} color={colors.muted2} />
          <Ionicons name="swap-horizontal" size={13} color={colors.muted2} />
          <Ionicons name="wallet" size={13} color={colors.muted2} />
          <Ionicons name="person" size={13} color={colors.muted2} />
        </View>
      </View>
    </View>
  );
}

function Slide2Graphic() {
  return (
    <View style={styles.deviceContainer}>
      <View style={[styles.deviceFrame, cardShadow]}>
        {/* Notch */}
        <View style={styles.deviceNotch} />
        
        {/* Portfolio Stats */}
        <View style={{ paddingHorizontal: spacing.md, marginTop: spacing.md }}>
          <Text style={styles.deviceLabel}>Your Portfolio</Text>
          <Text style={styles.deviceBalance}>Balance unavailable</Text>
          <Text style={[styles.devicePnL, { color: colors.up }]}>▲ 8.75% (24h)</Text>
        </View>

        {/* Chart representation */}
        <View style={styles.chartContainer}>
          <LinearGradient
            colors={['rgba(22,199,132,0.18)', 'rgba(22,199,132,0.01)']}
            style={styles.chartFill}
          />
          {/* Simple vector graphic of a sparkline */}
          <View style={styles.chartLine} />
        </View>

        {/* Allocation representation */}
        <View style={styles.allocationRow}>
          <View style={styles.donutCircle}>
            <View style={styles.donutHole} />
          </View>
          <View style={{ gap: 2 }}>
            <Text style={styles.allocItem}>• BTC: 60%</Text>
            <Text style={styles.allocItem}>• ETH: 30%</Text>
            <Text style={styles.allocItem}>• SOL: 10%</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Slide3Graphic() {
  return (
    <View style={styles.vaultContainer}>
      <View style={[styles.vaultOuter, cardShadow]}>
        <View style={styles.vaultDoor}>
          {/* Wheel Hub */}
          <View style={styles.vaultWheel}>
            <View style={[styles.spoke, { transform: [{ rotate: '0deg' }] }]} />
            <View style={[styles.spoke, { transform: [{ rotate: '45deg' }] }]} />
            <View style={[styles.spoke, { transform: [{ rotate: '90deg' }] }]} />
            <View style={[styles.spoke, { transform: [{ rotate: '135deg' }] }]} />
            <View style={styles.vaultHub} />
          </View>
          {/* Center lock shield */}
          <View style={styles.vaultLock}>
            <Ionicons name="lock-closed" size={24} color={colors.brand} />
          </View>
        </View>
      </View>

      {/* Biometric sensors on the sides */}
      <View style={styles.sideSensors}>
        <View style={styles.sensorBadge}>
          <Ionicons name="finger-print" size={22} color={colors.brand} />
        </View>
        <View style={styles.sensorBadge}>
          <Ionicons name="scan-outline" size={22} color={colors.brand} />
        </View>
      </View>
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const next = () => {
    if (index < 2) {
      scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
    } else {
      router.replace('/(auth)/register');
    }
  };

  const skip = () => {
    router.replace('/(auth)/login');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBackground />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          style={{ flex: 1 }}
        >
          {/* Slide 1 */}
          <View style={[styles.slide, { width }]}>
            <View style={styles.slideHeader}>
              <BrandMark size="md" subtitle="India Pvt. Ltd" />
              <Text style={styles.slide1Title}>India’s Secure INR-First Exchange Experience</Text>
              <Text style={styles.slide1Subtitle}>Buy, Sell &amp; Trade 500+ digital assets with trust &amp; confidence.</Text>
            </View>
            <Slide1Graphic />
          </View>

          {/* Slide 2 */}
          <View style={[styles.slide, { width }]}>
            <Slide2Graphic />
            <View style={styles.slideFooter}>
              <Text style={styles.title}>
                Trade <Text style={{ color: colors.brand }}>Smarter</Text>
              </Text>
              <Text style={styles.body}>Advanced charts, real-time market updates &amp; powerful analytics to maximize your returns.</Text>
            </View>
          </View>

          {/* Slide 3 */}
          <View style={[styles.slide, { width }]}>
            <Slide3Graphic />
            <View style={styles.slideFooter}>
              <Text style={styles.title}>
                Bank-Grade <Text style={{ color: colors.brand }}>Security</Text>
              </Text>
              <Text style={styles.body}>Your assets are protected with advanced encryption, cold storage &amp; biometric authentication.</Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer controls layout */}
        <View style={styles.footerRow}>
          <Pressable onPress={skip} hitSlop={15}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>

          <View style={styles.dots}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <Pressable onPress={next} style={styles.nextBtn}>
            <LinearGradient
              colors={goldGradient}
              style={styles.nextBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.nextBtnText}>
                {index === 2 ? 'Get Started' : 'Next'}
              </Text>
              {index < 2 && (
                <Ionicons name="chevron-forward-sharp" size={13} color="#1A1206" style={{ marginLeft: 1 }} />
              )}
            </LinearGradient>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1, justifyContent: 'space-between', paddingVertical: spacing.xl },
  slideHeader: { alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.md, marginTop: spacing.md },
  slide1Title: { color: colors.ink, fontSize: font.xxl - 2, fontWeight: '900', textAlign: 'center', lineHeight: 30, letterSpacing: 0.5 },
  slide1Subtitle: { color: colors.muted, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },
  slideFooter: { alignItems: 'center', paddingHorizontal: spacing.xl, gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.ink, fontSize: font.xxl - 2, fontWeight: '900', textAlign: 'center' },
  body: { color: colors.muted, fontSize: font.sm, textAlign: 'center', lineHeight: 20 },
  
  // Footer row Skip - Dots - Next
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, height: 60 },
  skipText: { color: colors.muted, fontSize: font.sm, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.line },
  dotActive: { width: 16, backgroundColor: colors.brand },
  nextBtn: { borderRadius: radius.md, overflow: 'hidden' },
  nextBtnGradient: { height: 40, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  nextBtnText: { color: '#1A1206', fontSize: font.sm, fontWeight: '800' },

  // Graphics Visual CSS
  deviceContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', marginVertical: spacing.md },
  deviceFrame: {
    width: 190,
    height: 310,
    backgroundColor: '#0A0A0F',
    borderRadius: 28,
    borderWidth: 2,
    borderColor: colors.brand,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.sm,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  deviceNotch: {
    position: 'absolute',
    top: 4,
    alignSelf: 'center',
    width: 60,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#000',
  },
  deviceScreenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 4,
  },
  deviceScreenTitle: { color: '#fff', fontSize: font.xs, fontWeight: '800' },
  deviceScreenSub: { color: colors.muted2, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  watchlistTitle: { color: '#fff', fontSize: font.sm, fontWeight: '700', paddingHorizontal: 4, marginTop: spacing.sm },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 4,
  },
  coinIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinSymbol: { fontSize: font.sm, fontWeight: '900' },
  coinName: { color: '#fff', fontSize: 11, fontWeight: '700' },
  coinQty: { color: colors.muted2, fontSize: 8 },
  coinPrice: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  coinChange: { fontSize: 8, fontWeight: '700', marginTop: 1 },
  deviceTabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
    height: 36,
    backgroundColor: '#0F0F16',
    marginHorizontal: -spacing.sm,
  },

  // Slide 2 Graphic details
  deviceLabel: { color: colors.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  deviceBalance: { color: '#fff', fontSize: font.lg, fontWeight: '900', fontFamily: 'monospace', marginTop: 2 },
  devicePnL: { fontSize: 9, fontWeight: '700', marginTop: 2 },
  chartContainer: { height: 100, marginHorizontal: -spacing.sm, position: 'relative', justifyContent: 'flex-end', marginTop: spacing.md },
  chartFill: { ...StyleSheet.absoluteFillObject },
  chartLine: {
    height: 2,
    backgroundColor: colors.up,
    width: '100%',
    shadowColor: colors.up,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    // simulated curve
    top: 30,
    position: 'absolute',
  },
  allocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: '#0E0E14',
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  donutCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 4,
    borderColor: colors.brand,
    borderTopColor: '#3B82F6',
    borderRightColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutHole: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0E0E14',
  },
  allocItem: { color: colors.muted, fontSize: 8, fontWeight: '600' },

  // Vault Door styles
  vaultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', marginVertical: spacing.md },
  vaultOuter: {
    width: 170,
    height: 170,
    borderRadius: 24,
    backgroundColor: '#111116',
    borderWidth: 1.5,
    borderColor: colors.glassBorderGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultDoor: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#0B0B0F',
    borderWidth: 4,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  vaultWheel: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spoke: {
    position: 'absolute',
    width: 4,
    height: 64,
    backgroundColor: colors.brand,
    borderRadius: 2,
    opacity: 0.85,
  },
  vaultHub: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  vaultLock: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#111116',
    borderWidth: 1.5,
    borderColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    top: -12,
    right: -12,
    shadowColor: colors.brand,
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  sideSensors: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xl,
  },
  sensorBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.glassBorderGold,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
