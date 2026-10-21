import { z } from "zod";
export const projectId = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);
export const relativeFile = z
  .string()
  .min(1)
  .refine(
    (p) =>
      !p.includes("\\") &&
      !p.startsWith("/") &&
      !p.includes(":") &&
      p.split("/").every((s) => s !== ".." && s !== "." && s !== ""),
    "Use a relative project path without traversal",
  );
export const manifestSchema = z.object({
  id: projectId,
  name: z.string().min(1).max(100),
  type: z.enum(["explainer", "lyrics", "custom"]),
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(7680),
  fps: z.number().int().min(1).max(120),
  durationInFrames: z.number().int().min(1).max(216000),
  entry: relativeFile.refine(
    (p) => /\.(tsx|jsx)$/.test(p),
    "Entry must be TSX or JSX",
  ),
  sdkVersion: z.literal("0.1.0"),
  description: z.string().max(500).optional(),
  timeline: relativeFile.optional(),
  editTimeline: relativeFile.refine(p=>p.endsWith('.json'),'Editable timeline must be JSON').optional(),
  audio: relativeFile.optional(),
});
export type ProjectManifest = z.infer<typeof manifestSchema>;
export type ProjectRecord = {
  id: string;
  manifest?: ProjectManifest;
  error?: string;
};
