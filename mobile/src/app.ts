import './runtime-init';
import { Application, Frame } from '@nativescript/core';
import { galleryPage } from './pages';
Application.run({ create: () => { const frame = new Frame(); frame.navigate({ create: galleryPage }); return frame; } });
