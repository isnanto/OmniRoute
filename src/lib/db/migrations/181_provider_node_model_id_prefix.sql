-- Migration 181: add model_id_prefix column to provider_nodes
--
-- Allows operator to configure a vendor-specific model prefix per node
-- (e.g. "amanai/" for Amanai, "openrouter/" for OpenRouter).
-- DefaultExecutor reads this via providerSpecificData.modelIdPrefix and
-- prepends it to the bare model name before forwarding to upstream —
-- transparent to clients, no hardcoded domain checks needed.

ALTER TABLE provider_nodes ADD COLUMN model_id_prefix TEXT DEFAULT NULL;
