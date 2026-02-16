/**
 * parseYaml — YAML parser wrapping js-yaml.
 *
 * Replicates Obsidian's parseYaml() function.
 */

import { load, dump } from "js-yaml";

/**
 * Parse a YAML string into a JavaScript object.
 */
export function parseYaml(yamlString: string): any {
	return load(yamlString);
}

/**
 * Stringify a JavaScript object to YAML.
 */
export function stringifyYaml(obj: any): string {
	return dump(obj);
}
