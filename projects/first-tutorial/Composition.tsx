import {TimelineComposition,type EditableVideoProps,type EditableComponent} from '@motion/sdk/editor';
import {parseEditTimeline} from '@motion/sdk/timeline';
import {subtitleModule} from '@motion/lyrics-sync/component';
import TitleScene from './scenes/TitleScene';
import ConversationScene from './scenes/ConversationScene';
import ToolkitScene from './scenes/ToolkitScene';
import data from './edit-timeline.json';
export const editorComponents:EditableComponent[]=[
 {id:'title',name:'Idea',fields:[],component:TitleScene},
 {id:'conversation',name:'Conversation',fields:[],component:ConversationScene},
 {id:'toolkit',name:'Toolkit',fields:[],component:ToolkitScene},subtitleModule];
export default function FirstTutorial({timeline}:EditableVideoProps){return <TimelineComposition timeline={timeline??parseEditTimeline(data)} components={editorComponents}/>;}
