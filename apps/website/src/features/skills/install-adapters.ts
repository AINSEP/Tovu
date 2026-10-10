import yauzl from "yauzl";
import { load, FAILSAFE_SCHEMA } from "js-yaml";
import { createNodeSkillFilesystem, createYauzlSkillArchiveReader, type YamlReaderPort } from "@jini-ai/agentic/skills/install";
export const filesystem = createNodeSkillFilesystem({});
export const archiveReader = createYauzlSkillArchiveReader({ yauzl });
/** Failsafe schema rejects executable YAML tags and duplicate keys. */
export const yamlReader: YamlReaderPort = { read: ({ yaml }) => load(yaml, { schema: FAILSAFE_SCHEMA }) };
