/// <reference lib="webworker" />
// The Performance tab's column engine off the page's thread — this is the whole worker. The engine
// entry point has no Angular in it, so the worker stays small.
import { weGridServeColumnStore } from 'we-grid-angular/engine';

weGridServeColumnStore();
