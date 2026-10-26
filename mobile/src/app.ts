import {guiExperimentRequested} from './experiments/gui-ui/flags';
import {guiExperimentPage} from './experiments/gui-ui/page';
import './runtime-init';
import { Application, Frame } from '@nativescript/core';
import { galleryPage, validationPage,tutorialReviewPage } from './pages';
import {tutorialReviewRequested} from './platform/tutorial-review';
import { nativeValidationRequested } from './platform/validation';
Application.run({ create: () => { const frame = new Frame(); frame.navigate({ create: tutorialReviewRequested()?tutorialReviewPage:guiExperimentRequested() ? guiExperimentPage : nativeValidationRequested() ? validationPage : galleryPage }); return frame; } });
