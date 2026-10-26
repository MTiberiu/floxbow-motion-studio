import { z } from "zod";

const motionId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120);
const poseSchema = z.object({ id: motionId, name: z.string().min(1).max(120), note: z.string().max(2000) }).strict();
export const motionDefinitionSchema = z.object({
  id: motionId,
  name: z.string().min(1).max(160),
  type: z.enum(["walk", "run", "jump", "dance", "idle", "custom"]),
  description: z.string().max(4000),
  duration: z.number().positive().max(120).nullable(),
  loop: z.boolean(),
  direction: z.string().max(500),
  view: z.string().max(500),
  poseGuidance: z.string().max(4000),
  poses: z.array(poseSchema).max(40),
  builtIn: z.boolean(),
}).strict();
export const motionLibrarySchema = z.array(motionDefinitionSchema).max(500);
export type MotionDefinition = z.infer<typeof motionDefinitionSchema>;
export type MotionPose = MotionDefinition["poses"][number];

const key = "floxbow-motion-library:v1";
const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const make = (name: string, type: MotionDefinition["type"], count: number, duration: number, loop: boolean, poseGuidance: string): MotionDefinition => ({
  id: `motion-${type}`, name, type, description: "", duration, loop, direction: "", view: "", poseGuidance,
  poses: Array.from({ length: count }, (_, index) => ({ id: `pose-${type}-${index + 1}`, name: `${type}-${index + 1}`, note: "" })),
  builtIn: true,
});

export const starterMotionLibrary: MotionDefinition[] = [
  make("Walk", "walk", 4, 2, true, "Keep stride length, clothing and body proportions consistent. Align the feet to the same ground line."),
  make("Run", "run", 4, 1, true, "Use a forward lean and clear airborne/grounded phases. Keep the character identity and ground line consistent."),
  make("Jump", "jump", 3, 1.2, false, "Show anticipation, airborne peak and landing. Keep the takeoff and landing anchor consistent."),
  make("Dance", "dance", 6, 4, true, "Use readable poses with a clear rhythm. Keep the character design and proportions stable."),
  make("Idle", "idle", 2, 3, true, "Use small relaxed changes in pose while keeping the character's position and identity stable."),
];

export function readMotionLibrary(): MotionDefinition[] {
  const raw = localStorage.getItem(key);
  if (!raw) return structuredClone(starterMotionLibrary);
  try { return motionLibrarySchema.parse(JSON.parse(raw)); }
  catch { return structuredClone(starterMotionLibrary); }
}

export function writeMotionLibrary(input: unknown): MotionDefinition[] {
  const library = motionLibrarySchema.parse(input);
  localStorage.setItem(key, JSON.stringify(library));
  window.dispatchEvent(new Event("floxbow-motion-library-change"));
  return library;
}

export function newMotionDefinition(type: MotionDefinition["type"] = "custom"): MotionDefinition {
  const name = type === "custom" ? "New motion set" : `${type[0].toUpperCase()}${type.slice(1)} variation`;
  return { id: id("motion"), name, type, description: "", duration: null, loop: false, direction: "", view: "", poseGuidance: "", poses: [], builtIn: false };
}
