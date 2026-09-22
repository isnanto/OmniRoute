import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-model-id-prefix-"));
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../src/lib/db/core.ts");
const providersDb = await import("../../src/lib/db/providers.ts");
const { hydrateConnectionProviderSpecificData } = await import(
  "../../src/sse/services/compatibleNodeBaseUrl.ts"
);
const { createProviderNodeSchema, updateProviderNodeSchema } = await import(
  "../../src/shared/validation/schemas.ts"
);
const { DefaultExecutor } = await import("../../open-sse/executors/default.ts");

async function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(resetStorage);

test.after(async () => {
  await resetStorage();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

test("provider node schemas preserve an optional slash-terminated modelIdPrefix", () => {
  const create = createProviderNodeSchema.parse({
    name: "Amanai",
    prefix: "petirs",
    apiType: "chat",
    baseUrl: "https://api.amanai.dev/v1",
    modelIdPrefix: "amanai/",
  });
  const update = updateProviderNodeSchema.parse({
    name: "Amanai",
    prefix: "petirs",
    apiType: "chat",
    baseUrl: "https://api.amanai.dev/v1",
    modelIdPrefix: "amanai/",
  });

  assert.equal(create.modelIdPrefix, "amanai/");
  assert.equal(update.modelIdPrefix, "amanai/");
  assert.equal(
    createProviderNodeSchema.safeParse({
      name: "Bad",
      prefix: "bad",
      apiType: "chat",
      baseUrl: "https://example.com/v1",
      modelIdPrefix: "missing-slash",
    }).success,
    false
  );
});

test("provider node CRUD persists and updates modelIdPrefix", async () => {
  const created = await providersDb.createProviderNode({
    id: "openai-compatible-chat-prefix-test",
    type: "openai-compatible",
    name: "Prefix Test",
    prefix: "prefix-test",
    apiType: "chat",
    baseUrl: "https://example.com/v1",
    modelIdPrefix: "vendor/",
  });
  assert.equal(created.modelIdPrefix, "vendor/");

  const updated = await providersDb.updateProviderNode(created.id as string, {
    ...created,
    modelIdPrefix: "vendor-v2/",
  });
  assert.equal(updated?.modelIdPrefix, "vendor-v2/");
  assert.equal(
    (await providersDb.getProviderNodeById(created.id as string))?.modelIdPrefix,
    "vendor-v2/"
  );
});

test("compatible connection hydration includes modelIdPrefix even when baseUrl already exists", async () => {
  const provider = "openai-compatible-chat-7cb7a050-2a8f-4601-a59a-a07adef2a564";
  await providersDb.createProviderNode({
    id: provider,
    type: "openai-compatible",
    name: "Hydration Test",
    prefix: "hydration",
    apiType: "chat",
    baseUrl: "https://example.com/v1",
    modelIdPrefix: "vendor/",
  });

  const hydrated = await hydrateConnectionProviderSpecificData({
    provider,
    providerSpecificData: { baseUrl: "https://example.com/v1" },
  });

  assert.equal(hydrated.modelIdPrefix, "vendor/");
});

test("DefaultExecutor prepends modelIdPrefix without discarding nested model path segments", () => {
  const executor = new DefaultExecutor("openai-compatible-chat-prefix-test");
  const original = {
    model: "meta-llama/llama-3.3-70b-instruct",
    messages: [{ role: "user", content: "hi" }],
  };

  const prefixed = executor.transformRequest(original.model, original, false, {
    providerSpecificData: {
      baseUrl: "https://example.com/v1",
      modelIdPrefix: "gateway/",
    },
  }) as Record<string, unknown>;
  const alreadyQualified = executor.transformRequest(
    "gateway/meta-llama/llama-3.3-70b-instruct",
    { ...original, model: "gateway/meta-llama/llama-3.3-70b-instruct" },
    false,
    {
      providerSpecificData: {
        baseUrl: "https://example.com/v1",
        modelIdPrefix: "gateway/",
      },
    }
  ) as Record<string, unknown>;

  assert.equal(prefixed.model, "gateway/meta-llama/llama-3.3-70b-instruct");
  assert.equal(alreadyQualified.model, "gateway/meta-llama/llama-3.3-70b-instruct");
  assert.equal(original.model, "meta-llama/llama-3.3-70b-instruct");
});
