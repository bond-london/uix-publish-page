import { Environment } from "@graphcms/uix-react-sdk";
import {
  GraphQLObjectType,
  GraphQLOutputType,
  isNonNullType,
  isListType,
  isUnionType,
  isObjectType,
  getIntrospectionQuery,
  IntrospectionQuery,
  buildClientSchema,
  GraphQLAbstractType,
  GraphQLInterfaceType,
} from "graphql";
import { createExecutor, IQueryExecutor } from "./executor";

const fieldsToIgnore = new Set([
  "documentInStages",
  "createdBy",
  "publishedBy",
  "updatedBy",
  "scheduledIn",
  "history",
]);

export interface Explorer {
  possibleTypes: Map<string, GraphQLObjectType<any, any>>;
  exploredTypes: ReadonlySet<string>;
  usedStages: Set<string>;
  level: number;
  query: string[];
  execute: IQueryExecutor;
  name: string;
  plural: string;
  camel: string;
}

function nextLevel(explorer: Explorer) {
  return { ...explorer, level: explorer.level + 1 };
}

function indent(level: number) {
  return "  ".repeat(level);
}

function getTitleField(possibleType: GraphQLObjectType<any, any>) {
  const fields = possibleType.getFields();
  for (const field of ["slug", "title", "name"]) {
    if (fields[field]) return field;
  }
}

function camelize(str: string) {
  return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
    if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
    return index === 0 ? match.toLowerCase() : match.toUpperCase();
  });
}

function exploreType(
  { exploredTypes, ...rest }: Explorer,
  type: GraphQLObjectType
) {
  if (exploredTypes.has(type.name)) return;

  const typeDetails = rest.possibleTypes.get(type.name);
  if (!typeDetails) {
    return;
  }

  const newExploredTypes = new Set([...exploredTypes, type.name]);
  const newExplorer = {
    ...rest,
    exploredTypes: newExploredTypes,
  };
  const fields = typeDetails.getFields();
  for (const fieldName in fields) {
    if (fieldsToIgnore.has(fieldName) || fieldName.startsWith("related")) {
      continue;
    }

    const field = fields[fieldName];
    walkType(nextLevel(newExplorer), fieldName, field.type, true);
  }
}

function walkType(
  explorer: Explorer,
  name: string,
  type: GraphQLOutputType,
  showName: boolean
) {
  if (isNonNullType(type)) {
    walkType(explorer, name, type.ofType, true);
    return;
  }
  if (isListType(type)) {
    walkType(explorer, name, type.ofType, true);
    return;
  }
  const spaces = indent(explorer.level);
  if (isUnionType(type)) {
    const types = type.getTypes();
    let hasOpened = false;
    for (const subType of types) {
      if (explorer.possibleTypes.has(subType.name)) {
        if (!hasOpened) {
          if (showName) explorer.query.push(`${spaces}  ${name} {`);
          hasOpened = true;
        }

        explorer.query.push(`${spaces}    ... on ${subType.name} {`);
        walkType(nextLevel(explorer), name, subType, false);
        explorer.query.push(`${spaces}    }`);
      }
    }
    if (hasOpened && showName) explorer.query.push(`${spaces}  }`);
    return;
  }
  if (isObjectType(type)) {
    if (!explorer.possibleTypes.has(type.name)) {
      // console.log("cannot find", name);
    } else {
      if (showName) explorer.query.push(`${spaces}  ${name} {`);
      explorer.usedStages.add(type.name);
      explorer.query.push(`${spaces}    ...${type.name}Stages`);
      exploreType(nextLevel(explorer), type);
      if (showName) explorer.query.push(`${spaces}  }`);
    }
    return;
  }
  return;
}

export async function explore(environment: Environment, name: string) {
  const execute = createExecutor(environment.endpoint, environment.authToken);
  const introspectionResult = await execute({
    query: getIntrospectionQuery(),
    operationName: "IntrospectionQuery",
    variables: {},
  });

  const introspectionQuery =
    introspectionResult.data as unknown as IntrospectionQuery;
  const schema = buildClientSchema(introspectionQuery);

  const nodeInterface = schema.getType("Node") as GraphQLAbstractType;
  const queryInterface = schema.getType("Query") as GraphQLInterfaceType;
  const queryFields = queryInterface.getFields();
  const possibleTypes = schema
    .getPossibleTypes(nodeInterface)
    .filter((p) => p.name !== "User");
  const pluralRootFieldName = (type: GraphQLObjectType<any, any>) =>
    Object.keys(queryFields).find(
      (fieldName) => String(queryFields[fieldName].type) === `[${type.name}!]!`
    );

  const possibleTypesMap = new Map(possibleTypes.map((p) => [p.name, p]));

  const fragments = new Map<string, string>();
  for (const possibleType of possibleTypes) {
    const title = getTitleField(possibleType);

    fragments.set(
      possibleType.name,
      `fragment ${possibleType.name}Stages on ${possibleType.name} {
    id      
    stage
    ${title ? `__title: ${title}` : "__title: id"}
    __typename
    documentInStages(includeCurrent: true) {
      stage
      publishedAt
      updatedAt
    }      
  }`
    );
  }

  const possibleType = possibleTypesMap.get(name);
  if (!possibleType) return;
  const camel = camelize(name);

  const exploredTypes = new Set(["Asset", "Page", "Article", "PopUp", "Link"]);
  exploredTypes.delete(name);
  const plural = pluralRootFieldName(possibleType) || name;
  const explorer: Explorer = {
    possibleTypes: possibleTypesMap,
    usedStages: new Set<string>(),
    exploredTypes,
    level: 0,
    query: [],
    execute,
    name,
    plural,
    camel,
  };
  explorer.usedStages.add(name);
  explorer.query.push(`fragment ${name}Checker on ${name} {
    ...${name}Stages`);
  exploreType(explorer, possibleType);
  explorer.query.push(`}`);

  const finalQuery = `query Check${name}($id: ID) {
  ${camel}(where: {id: $id}) {
    ...${name}Checker
  }
}`;

  explorer.usedStages.forEach((used) => {
    const frag = fragments.get(used);
    if (!frag) {
      throw new Error(`No fragment for ${used}`);
    }
    explorer.query.push(frag);
  });
  explorer.query.push(finalQuery);
  return explorer;
}
