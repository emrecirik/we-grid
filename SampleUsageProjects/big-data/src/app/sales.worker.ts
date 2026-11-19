/// <reference lib="webworker" />
// The whole worker: the column engine answers the grid's requests off the page's thread. The engine
// entry point has no Angular in it, so this bundle stays small.
import { weGridServeColumnStore } from 'we-grid-angular/engine';

weGridServeColumnStore();
