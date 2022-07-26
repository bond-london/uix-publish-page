import {
  ExtensionType,
  FormSidebarExtensionDeclaration,
  useFormSidebarExtension,
  Wrapper,
} from "@graphcms/uix-react-sdk";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { examineResults, OutOfDateInformation } from "./ExaminePage";
import { explore, Explorer } from "./ExploreModel";

const declaration: FormSidebarExtensionDeclaration = {
  extensionType: ExtensionType.formSidebar,
  name: "Publish page",
  description: "Publish a page and all the underlying models",
  config: {},
  sidebarConfig: {},
};

const OutOfDateStatus: React.FC<{ outOfDate: OutOfDateInformation[] }> = ({
  outOfDate,
}) => {
  const state = useMemo(() => {
    const isModelOutOfDate = outOfDate[0].path === "";
    const nodesOutOfDate = outOfDate.length - (isModelOutOfDate ? 1 : 0);
    const mutation: string[] = ["mutation {"];
    outOfDate.forEach((entry, index) => {
      mutation.push(
        `  p${index}: publish${entry.__typename}(where: {id: "${entry.id}"} to:PUBLISHED) { id }`
      );
    });
    mutation.push("}");
    const mutationQuery = mutation.join("\n");
    return { isModelOutOfDate, nodesOutOfDate, mutationQuery };
  }, [outOfDate]);

  const { isModelOutOfDate, nodesOutOfDate, mutationQuery } = state;

  const handleQueryClick = useCallback(() => {
    navigator.clipboard
      .writeText(mutationQuery)
      .then(() => console.log("Copied to clipboard"))
      .catch((error) => {
        console.error("Failed to copy", error);
      });
  }, [mutationQuery]);

  return (
    <>
      <h4>Out of date information</h4>
      {isModelOutOfDate && <p>Model is out of date</p>}
      {nodesOutOfDate > 0 && (
        <p>
          There {nodesOutOfDate > 1 ? "are" : "is"} {nodesOutOfDate} node
          {nodesOutOfDate > 1 ? "s" : ""} out of date
        </p>
      )}
      {mutationQuery && <pre onClick={handleQueryClick}>{mutationQuery}</pre>}
    </>
  );
};

const PublishPage: React.FC = () => {
  const ext = useFormSidebarExtension();
  console.log(ext);
  const {
    context,
    model,
    entry,
    form: { getState },
  } = ext;

  const [explorer, setExplorer] = useState<Explorer>();
  const [error, setError] = useState<any>();
  const [results, setResults] = useState<OutOfDateInformation[]>();

  useEffect(() => {
    console.log("exploring...");
    explore(context, model).then(setExplorer).catch(setError);
  }, [context, model]);

  useEffect(() => {
    if (explorer && entry?.id) {
      console.log("examining");
      examineResults(explorer, entry.id).then(setResults).catch(setError);
    }
  }, [explorer, entry]);

  const [state, setState] = useState<Record<string, any>>();

  useEffect(() => {
    getState().then(setState).catch(console.error);
  }, [getState]);

  useEffect(() => console.log("state", state), [state]);

  return (
    <>
      <h3>Explorer</h3>
      {results && results.length > 0 && <OutOfDateStatus outOfDate={results} />}
      {explorer && !results && <h5>Loading results for current model</h5>}
      {!results && <h5>Exploring model</h5>}
      {/* {results && <pre>{JSON.stringify(results, undefined, 2)}</pre>}
      {explorer && <pre>{JSON.stringify(explorer, undefined, 2)}</pre>} */}
      {error && <pre>{JSON.stringify(error, undefined, 2)}</pre>}
    </>
  );
};

const PublishPageLayout: React.FC = () => {
  const uid = useMemo(() => {
    return (
      new URLSearchParams(document.location.search).get("extensionUid") ||
      undefined
    );
  }, []);

  return (
    <Wrapper declaration={declaration} uid={uid} debug={true}>
      <PublishPage />
    </Wrapper>
  );
};

export default PublishPageLayout;
