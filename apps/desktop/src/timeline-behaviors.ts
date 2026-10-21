import type {ComponentInfo,TimelineBehavior} from '@motion/sdk/timeline';
import {subtitleTimelineBehavior} from '@motion/lyrics-sync/subtitles';

const genericBehavior:TimelineBehavior={id:'generic-visual'};
const trustedBehaviors=new Map<string,TimelineBehavior>([
 ['generic-visual',genericBehavior],
 [subtitleTimelineBehavior.id,subtitleTimelineBehavior],
]);

/** Resolve only built-in behavior IDs; metadata never supplies executable behavior code. */
export function resolveTimelineBehavior(componentId:string,components:readonly ComponentInfo[]):TimelineBehavior{
 const info=components.find(component=>component.id===componentId);
 if(info?.timelineBehavior!==undefined)return trustedBehaviors.get(info.timelineBehavior)??genericBehavior;
 // Compatibility for existing projects/modules that predate behavior metadata.
 if(componentId==='subtitles')return subtitleTimelineBehavior;
 return genericBehavior;
}
