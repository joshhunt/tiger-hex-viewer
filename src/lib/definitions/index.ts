import {
  DestinyManifest,
  ServerResponse,
  AllDestinyManifestComponents,
} from "bungie-api-ts/destiny2";
import { getMany, set } from "idb-keyval";
import asyncPool from "tiny-async-pool";

async function getManifest() {
  const resp = await fetch(
    "https://www.bungie.net/Platform/Destiny2/Manifest/",
    {
      headers: {
        "x-api-key": "21a93b95633f476f88f8ba183edb3c32",
      },
    }
  );

  const data = await resp.json();
  const typedData = data as ServerResponse<DestinyManifest>;

  return typedData.Response;
}

const LANGUAGE = "en";

export default async function getDefinitions(): Promise<AllDestinyManifestComponents> {
  const manifest = await getManifest();

  const tables = Object.entries(
    manifest.jsonWorldComponentContentPaths[LANGUAGE]
  )
    .map(([tableName, path]) => ({ tableName, path }))
    .filter((v) => v.tableName !== "DestinyInventoryItemLiteDefinition");

  const tableUrls = tables.map((v) => v.path);

  const storedDefinitions = await getMany(tableUrls);
  const combined = storedDefinitions.map((definitions, index) => ({
    definitions,
    ...tables[index],
  }));

  const results = await asyncPool(5, combined, async (v) => {
    if (v.definitions) {
      return v;
    }

    const resp = await fetch(`https://www.bungie.net${v.path}`);
    const definitions = await resp.json();

    if (v.tableName === "DestinyPlugSetDefinition") {
      // PlugSets contain "fake" definitions which are not in the game data, and should be removed
      for (const hash in definitions) {
        const def = definitions[hash];
        if (def.isFakePlugSet) {
          delete definitions[hash];
        }
      }
    }

    await set(v.path, definitions);

    return {
      ...v,
      definitions,
    };
  });

  const allDefinitions = Object.fromEntries(
    results.map((v) => [v.tableName, v.definitions])
  );

  // TODO: clean up previous versions

  return allDefinitions as AllDestinyManifestComponents;
}
