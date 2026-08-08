/**
 * @file Spanish translation for the `plugins` feature's own screens (`Plugins.tsx` and
 * `AgentPlugins.tsx`) — this feature's own dictionary, not the shared `lib/admin-nav-i18n.ts` one,
 * so parallel translation passes over other admin sections can't collide on the same file. Same
 * two-step fallback every other `t()` in this app uses: translated value, else the English source
 * string itself.
 */
import { createDictionaryTranslator } from "../../lib/dictionary-translator";

const PLUGINS_DICT: Record<string, Record<string, string>> = {
  es: {
    Studio: "Estudio",
    Plugins: "Plugins",
    "Loading plugins…": "Cargando plugins…",
    "Enable or disable plugins discovered in this site's plugin install directory.":
      "Activa o desactiva los plugins detectados en el directorio de instalación de plugins de este sitio.",
    "No plugins installed.": "No hay plugins instalados.",
    "A new one appears here on the next load, once it's unpacked into the site's plugin install directory.":
      "Uno nuevo aparecerá aquí en la próxima carga, una vez que se descomprima en el directorio de instalación de plugins del sitio.",
    Version: "Versión",
    Source: "Origen",
    Tier: "Nivel",
    Enabled: "Activado",
    Errors: "Errores",
    "Agent Plugins": "Plugins de agentes",
    "Agent Plugins is coming soon.": "Los plugins de agentes estarán disponibles próximamente.",
    "This is from the": "Esto proviene del",
    "Agent Plugins open standard": "estándar abierto Agent Plugins",
    "— packaging skills, tools, and MCP servers into portable plugins.":
    "— que empaqueta habilidades, herramientas y servidores MCP en plugins portables.",

    // Hook-level notice/error strings (use-plugins.hooks.ts) — these never got translated during
    // the JSX-only pass since they live in `.hooks.ts` files.
    "failed to load plugins": "no se pudieron cargar los plugins",
    "failed to update plugin": "no se pudo actualizar el plugin",
  },
};

export const t = createDictionaryTranslator(PLUGINS_DICT);
