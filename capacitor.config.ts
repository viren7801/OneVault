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
      autoUpdateStrategy: 'none',
      autoBlockRolledBackBundles: true,
      readyTimeout: 10000,
    },
  },
}

export default config
