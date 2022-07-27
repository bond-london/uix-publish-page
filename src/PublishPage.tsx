import {
  ExtensionType,
  FormSidebarExtensionDeclaration,
  useFormSidebarExtension,
  Wrapper,
} from "@graphcms/uix-react-sdk";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  MouseEvent,
} from "react";
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

  const handleQueryClick = useCallback(
    (event: MouseEvent<HTMLTextAreaElement>) => {
      navigator.clipboard
        .writeText(mutationQuery)
        .then(() => console.log("Copied to clipboard"))
        .catch((error) => {
          console.error("Failed to copy", error);
          const target = event.target as HTMLTextAreaElement;
          target.select();
        });
    },
    [mutationQuery]
  );

  return (
    <>
      {isModelOutOfDate && <p>Model is out of date</p>}
      {nodesOutOfDate > 0 && (
        <p>
          There {nodesOutOfDate > 1 ? "are" : "is"} {nodesOutOfDate} node
          {nodesOutOfDate > 1 ? "s" : ""} out of date
        </p>
      )}
      {mutationQuery && (
        <textarea
          rows={5}
          className="code"
          readOnly={true}
          onClick={handleQueryClick}
          value={mutationQuery}
        />
      )}
    </>
  );
};

const PublishPage: React.FC = () => {
  const ext = useFormSidebarExtension();
  const {
    context: { environment },
    model: { apiId },
    entry,
    form: { subscribeToFormState },
  } = ext;

  const [explorer, setExplorer] = useState<Explorer>();
  const [error, setError] = useState<any>();
  const [results, setResults] = useState<OutOfDateInformation[]>();
  const [readyToShow, setReadyToShow] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    subscribeToFormState(
      (state) => {
        console.log("state changed", state);
        if (state.submitting) setResults(undefined);
        setReadyToShow(
          !state.submitting &&
            (state.submitSucceeded || !state.modifiedSinceLastSubmit)
        );
      },
      {
        modifiedSinceLastSubmit: true,
        submitSucceeded: true,
        submitting: true,
      }
    )
      .then((cb) => (unsubscribe = cb))
      .catch((error) =>
        console.log("Failed to subscribe to form state", error)
      );
    return () => {
      unsubscribe?.();
    };
  }, [subscribeToFormState]);

  useEffect(() => {
    console.log("exploring...");
    explore(environment.endpoint, environment.authToken, apiId)
      .then(setExplorer)
      .catch(setError);
  }, [environment, apiId]);

  useEffect(() => {
    if (explorer && entry?.id && readyToShow) {
      console.log("examining");
      examineResults(explorer, entry.id).then(setResults).catch(setError);
    }
  }, [explorer, entry, readyToShow]);

  return (
    <>
      {results && results.length > 0 && <OutOfDateStatus outOfDate={results} />}
      {explorer && !results && <h5>Loading results for current model</h5>}
      {!results && !explorer && <h5>Exploring model</h5>}
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
