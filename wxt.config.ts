import { defineConfig } from 'wxt'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  srcDir: 'src',
  entrypointsDir: 'entrypoints',
  publicDir: path.resolve(__dirname, 'public'),
  outDir: 'build',
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    }
  }),
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    permissions: [
      'storage',
      'sidePanel',
      'activeTab',
      'tabs',
      'scripting',
      'contextMenus',
      'tts',
      'notifications',
      'unlimitedStorage',
      'declarativeNetRequest',
      'webRequest',
    ],
    action: {
      default_title: '__MSG_openSidePanelToChat__'
    },
    host_permissions: ['<all_urls>'],
    optional_host_permissions: ['<all_urls>'],
    commands: {
      _execute_action: {
        description: 'Open the Web UI',
        suggested_key: {
          default: 'Ctrl+Shift+L'
        }
      },
      execute_side_panel: {
        description: 'Open the side panel',
        suggested_key: {
          default: 'Ctrl+Shift+Y'
        }
      }
    }
  }
})
