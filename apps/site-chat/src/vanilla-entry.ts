import { mountVanillaChat } from '@jini-ai/chat/vanilla';
import '@jini-ai/chat/vanilla/style.css';
import './page-actions.css';
import './vanilla-theme.css';
import { mountSiteVanillaChat } from './vanilla-host';

// Standalone build entry: Jini owns the widget; Tovu supplies the site bindings.
mountSiteVanillaChat({ mount: mountVanillaChat });
