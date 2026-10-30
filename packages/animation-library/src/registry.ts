import { z } from "zod";

const capabilitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1),
  category: z.string().min(1),
  purpose: z.string().min(1),
  creatorActions: z.array(z.string().min(1)).min(1),
  suggestedPrompts: z.array(z.string().min(1)).min(1),
  api: z.object({ importPath: z.string().min(1), symbol: z.string().min(1) }),
  parameters: z.array(
    z.object({
      name: z.string().min(1),
      type: z.string().min(1),
      required: z.boolean().default(false),
      default: z.string().optional(),
      description: z.string().min(1),
    }),
  ),
  integration: z.object({
    timeline: z.string().min(1),
    editor: z.string().min(1),
  }),
  dependencies: z.array(z.string()),
  limitations: z.array(z.string()),
  documentation: z.string().min(1),
  exampleIds: z.array(z.string().min(1)).min(1),
});

const exampleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1),
  summary: z.string().min(1),
  path: z.string().min(1),
  capabilityIds: z.array(z.string()).min(1),
  preview: z.enum([
    "canvas",
    "fade",
    "kinetic-text",
    "chat-bubble",
    "comic-pop",
    "counter",
    "karaoke-words",
    "subtitle-clip",
    "threejs",
  ]).optional(),
});

export const capabilityRegistrySchema = z.object({
  version: z.literal(2),
  sdkVersion: z.string().min(1),
  capabilities: z.array(capabilitySchema).min(1),
  examples: z.array(exampleSchema).min(1),
}).superRefine((registry, ctx) => {
  const capabilityIds = new Set(registry.capabilities.map((item) => item.id));
  const exampleIds = new Set(registry.examples.map((item) => item.id));
  if (capabilityIds.size !== registry.capabilities.length)
    ctx.addIssue({ code: "custom", message: "Duplicate capability ID" });
  if (exampleIds.size !== registry.examples.length)
    ctx.addIssue({ code: "custom", message: "Duplicate example ID" });
  for (const capability of registry.capabilities)
    for (const id of capability.exampleIds)
      if (!exampleIds.has(id))
        ctx.addIssue({ code: "custom", message: `Unknown example ${id}` });
  for (const example of registry.examples)
    for (const id of example.capabilityIds)
      if (!capabilityIds.has(id))
        ctx.addIssue({ code: "custom", message: `Unknown capability ${id}` });
});

export type CapabilityRegistry = z.infer<typeof capabilityRegistrySchema>;
export type Capability = CapabilityRegistry["capabilities"][number];
export type CapabilityExample = CapabilityRegistry["examples"][number];

export function parseCapabilityRegistry(input: unknown): CapabilityRegistry {
  return capabilityRegistrySchema.parse(input);
}
