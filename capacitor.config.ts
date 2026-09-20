import type { CapacitorConfig } from '@capacitor/cli'

// Native base build: includes the in-app Update Center and Live Update runtime.
const config: CapacitorConfig = {
  appId: 'com.patelviren.onevault',
  appName: 'OneVault',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LiveUpdate: {
      autoUpdateStrategy: 'background',
      autoBlockRolledBackBundles: true,
      readyTimeout: 10000,
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_onevault',
    },
  },
}

export default config
