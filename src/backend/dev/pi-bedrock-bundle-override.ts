/**
 * data-club fork patch — make the single-file `letta.js` bundle self-contained
 * for AWS Bedrock on the local backend.
 *
 * pi-ai keeps its Bedrock streaming API (`@aws-sdk/client-bedrock-runtime`,
 * SigV4, …) out of edge-safe bundles by loading it through a *variable*
 * `import()` specifier inside `api/bedrock-converse-stream.lazy`. Bun cannot
 * bundle a variable specifier, so the published bundle ends up doing
 * `import("./bedrock-converse-stream.js")` relative to `letta.js` and fails
 * at runtime with "Cannot find module …/bedrock-converse-stream.js" on the
 * first Bedrock turn. The `api` backend never hits this (the Letta server
 * does inference there), which is why upstream does not notice.
 *
 * pi-ai exposes `setBedrockProviderModule()` for exactly this situation
 * ("the binary build, where the variable-specifier import cannot be
 * bundled"): register the implementation through a static import so the
 * bundler inlines it. Imported for its side effect from `pi-api-streams.ts`,
 * which every Bedrock stream goes through.
 */
import * as bedrockConverseStream from "@earendil-works/pi-ai/api/bedrock-converse-stream";
import { setBedrockProviderModule } from "@earendil-works/pi-ai/api/bedrock-converse-stream.lazy";

setBedrockProviderModule(bedrockConverseStream);
