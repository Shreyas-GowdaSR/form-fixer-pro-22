import { registerActivity } from "../registry";
import { longDistanceRunning } from "./long-distance-running";

/**
 * Register every implemented activity module here.
 * To add sprint / shot put / discus throw later:
 *   1. create ./sprint.ts exporting an ActivityModule
 *   2. registerActivity(sprint) below
 *   3. flip is_active = true for its slug in the activities table
 */
registerActivity(longDistanceRunning);

export { longDistanceRunning };