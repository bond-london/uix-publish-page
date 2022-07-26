import { DocumentNode, ExecutionResult } from "graphql";

export interface IQueryExecutionArgs {
  query: string;
  operationName: string;
  variables: object;
  document?: DocumentNode;
}
export interface IQueryExecutor {
  (args: IQueryExecutionArgs): Promise<ExecutionResult>;
}

export function createExecutor(endpoint: string, token: string) {
  const execute: IQueryExecutor = async ({
    operationName,
    query,
    variables = {},
  }) => {
    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify({ query, variables, operationName }),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      const message = await response.text();
      console.warn(message);
      throw new Error(response.statusText);
    }
    const result = (await response.json()) as Promise<ExecutionResult>;
    return result;
  };
  return execute;
}
