import {guiExperimentRequested} from './experiments/gui-ui/flags';
import {guiExperimentPage} from './experiments/gui-ui/page';
import './runtime-init';
import { Application, Frame } from '@nativescript/core';
import { galleryPage, validationPage } from './pages';
import { nativeValidationRequested } from './platform/validation';
Application.run({ create: () => { const frame = new Frame(); frame.navigate({ create: guiExperimentRequested() ? guiExperimentPage : nativeValidationRequested() ? validationPage : galleryPage }); return frame; } });
