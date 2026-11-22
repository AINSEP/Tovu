import { indexCatalogById } from "@jini-ai/core";
import { getThemesAgentToolCatalog } from "./agent-tools.js";



export const CATALOG_BY_ID = indexCatalogById({ catalog: getThemesAgentToolCatalog() });
