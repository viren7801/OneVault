import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.patelviren.onevault',
  appName: 'oneVault',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LiveUpdate: {
      autoUpdateStrategy: 'none',
      autoBlockRolledBackBundles: true,
      readyTimeout: 10000,
    },
  },
}

export default config
