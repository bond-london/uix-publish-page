import { Explorer } from "./ExploreModel";

export interface OutOfDateInformation {
  id: string;
  stage: string;
  __title: string;
  __typename: string;
  lastUpdated: string;
  lastPublished?: string;
  path: string;
}

interface StageInformation {
  id: string;
  stage: string;
  __title: string;
  __typename: string;
  documentInStages: {
    stage: string;
    publishedAt: string | null;
    updatedAt: string;
  }[];
}

const dummyInformation: StageInformation = {
  id: "xx",
  stage: "xx",
  __title: "xx",
  __typename: "xx",
  documentInStages: [],
};
const stageInformationKeys = new Set(Object.keys(dummyInformation));

function isOutOfDate(
  information: StageInformation,
  path: string
): OutOfDateInformation | undefined {
  const published = information.documentInStages.find(
    (d) => d.stage === "PUBLISHED"
  );
  const buildResult = () => {
    const draft = information.documentInStages.find(
      (i) => i.stage === "DRAFT"
    )!;
    const published = information.documentInStages.find(
      (i) => i.stage === "PUBLISHED"
    );
    return {
      id: information.id,
      stage: information.stage,
      __title: information.__title,
      __typename: information.__typename,
      lastUpdated: draft.updatedAt,
      lastPublished: published?.publishedAt || undefined,
      path,
    };
  };
  if (!published) {
    return buildResult();
  }
  const draft = information.documentInStages.find((d) => d.stage === "DRAFT");
  if (draft?.updatedAt !== published.updatedAt) {
    return buildResult();
  }

  if (!published.publishedAt) {
    return buildResult();
  }
  if (published.publishedAt < published.updatedAt) {
    return buildResult();
  }
}

function isEntryOutOfDate(
  path: string,
  entry: any,
  outOfDate: OutOfDateInformation[]
) {
  if (Array.isArray(entry)) {
    for (const index in entry) {
      const arrayEntry = entry[index];
      isEntryOutOfDate(`${path}/${index}`, arrayEntry, outOfDate);
    }
    return;
  }
  const information = entry as StageInformation;
  const result = isOutOfDate(information, path);
  if (result) {
    outOfDate.push(result);
  }

  const entryKeys = Object.keys(entry);
  for (const entryKey of entryKeys) {
    if (!stageInformationKeys.has(entryKey)) {
      const value = entry[entryKey];
      if (value) {
        isEntryOutOfDate(`${path}/${entryKey}`, value, outOfDate);
      }
    }
  }
}

export async function examineResults(explorer: Explorer, id: string) {
  console.log("examing results");
  const query = explorer.query.join("\n");
  try {
    const result = await explorer.execute({
      query,
      operationName: `Check${explorer.name}`,
      variables: { id },
    });
    const data = result?.data;
    const entry = data?.[explorer.camel] as any;
    const outOfDate: OutOfDateInformation[] = [];
    isEntryOutOfDate("", entry, outOfDate);
    console.log("out of date", outOfDate);
    if (outOfDate.length > 0) {
      return outOfDate;
    }
  } catch (error) {
    console.error("Failed to examine results", error);
    console.log({ query, id });
    throw error;
  }
}
