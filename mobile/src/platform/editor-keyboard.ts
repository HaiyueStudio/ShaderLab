import {ContentView,type TextView} from '@nativescript/core';
export type EditorCommand='undo'|'redo'|'find'|'replace'|'save'|'run';
export declare class EditorKeyboardHost extends ContentView {constructor(editor:TextView,execute:(command:EditorCommand)=>void)}
