import { installLazyChatLoader, loadChatAssets } from '@jini-ai/chat/browser/lazy-loader';
import { startSiteChatLoader } from './loader-host';

// Standalone build entry: Jini owns loading; Tovu supplies the site bindings.
startSiteChatLoader({ install: installLazyChatLoader, loadAssets: loadChatAssets });
