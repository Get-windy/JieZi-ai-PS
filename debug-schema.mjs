import { FeishuConfigSchema } from "./upstream/extensions/feishu/src/config-schema.js";
import { buildChannelConfigSchema } from "./src/channels/plugins/config-schema.js";

const result = buildChannelConfigSchema(FeishuConfigSchema);
const schema = result.schema;
const properties = schema?.properties;
const accountsField = properties?.accounts;
const additionalProps = accountsField?.additionalProperties;

console.log("schema keys:", schema ? Object.keys(schema) : "null");
console.log("has properties:", !!properties);
console.log("properties keys (first 10):", properties ? Object.keys(properties).slice(0,10) : "none");
console.log("accounts field keys:", accountsField ? Object.keys(accountsField) : "none");
console.log("additionalProperties has .properties:", !!(additionalProps?.properties));
console.log("additionalProperties.properties keys (first 5):", 
  additionalProps?.properties ? Object.keys(additionalProps.properties).slice(0,5) : "none");

// restProperties after removing accounts/defaultAccount
if (properties) {
  const { accounts: _a, defaultAccount: _d, ...restProperties } = properties;
  console.log("restProperties count:", Object.keys(restProperties).length);
  console.log("restProperties keys (first 5):", Object.keys(restProperties).slice(0,5));
}
