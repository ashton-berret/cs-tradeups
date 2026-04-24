export type KeyValue = string | KeyValueObject | KeyValue[];

export interface KeyValueObject {
	[key: string]: KeyValue | undefined;
}

export function parseKeyValuesText(text: string): KeyValueObject {
	const parser = new KeyValuesParser(stripBom(text));
	return parser.parseDocument();
}

export function kvObject(value: KeyValue | undefined): KeyValueObject | undefined {
	if (Array.isArray(value)) {
		return kvObject(value.at(-1));
	}

	return value != null && typeof value === 'object' ? (value as KeyValueObject) : undefined;
}

export function kvMergedObject(value: KeyValue | undefined): KeyValueObject | undefined {
	if (Array.isArray(value)) {
		return value.reduce<KeyValueObject | undefined>((merged, item) => {
			const objectValue = kvMergedObject(item);
			if (!objectValue) return merged;
			return merged ? mergeObjects(merged, objectValue) : objectValue;
		}, undefined);
	}

	return value != null && typeof value === 'object' ? (value as KeyValueObject) : undefined;
}

export function kvString(value: KeyValue | undefined): string | undefined {
	if (Array.isArray(value)) {
		return kvString(value.at(-1));
	}

	return typeof value === 'string' ? value : undefined;
}

export function kvEntries(value: KeyValueObject | undefined): Array<[string, KeyValue]> {
	return value ? (Object.entries(value) as Array<[string, KeyValue]>) : [];
}

function stripBom(value: string): string {
	return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

class KeyValuesParser {
	private readonly text: string;
	private index = 0;

	constructor(text: string) {
		this.text = text;
	}

	parseDocument(): KeyValueObject {
		const result: KeyValueObject = {};

		while (true) {
			const token = this.nextToken();
			if (token == null) {
				return result;
			}

			if (token === '}') {
				throw new Error(`Unexpected closing brace at character ${this.index}`);
			}

			const valueToken = this.nextToken();
			if (valueToken == null) {
				throw new Error(`Missing value for key "${token}"`);
			}

			assignValue(result, token, valueToken === '{' ? this.parseObject() : valueToken);
		}
	}

	private parseObject(): KeyValueObject {
		const result: KeyValueObject = {};

		while (true) {
			const token = this.nextToken();
			if (token == null) {
				throw new Error('Unterminated object in KeyValues input');
			}

			if (token === '}') {
				return result;
			}

			if (token === '{') {
				throw new Error(`Unexpected opening brace at character ${this.index}`);
			}

			const valueToken = this.nextToken();
			if (valueToken == null) {
				throw new Error(`Missing value for key "${token}"`);
			}

			assignValue(result, token, valueToken === '{' ? this.parseObject() : valueToken);
		}
	}

	private nextToken(): string | null {
		this.skipWhitespaceAndComments();

		if (this.index >= this.text.length) {
			return null;
		}

		const char = this.text[this.index];
		if (char === '{' || char === '}') {
			this.index += 1;
			return char;
		}

		if (char === '"') {
			return this.readQuotedString();
		}

		return this.readBareToken();
	}

	private skipWhitespaceAndComments(): void {
		while (this.index < this.text.length) {
			const char = this.text[this.index];

			if (/\s/.test(char)) {
				this.index += 1;
				continue;
			}

			if (char === '/' && this.text[this.index + 1] === '/') {
				this.index += 2;
				while (this.index < this.text.length && this.text[this.index] !== '\n') {
					this.index += 1;
				}
				continue;
			}

			break;
		}
	}

	private readQuotedString(): string {
		let result = '';
		this.index += 1;

		while (this.index < this.text.length) {
			const char = this.text[this.index];
			if (char === '\\') {
				const nextChar = this.text[this.index + 1];
				if (nextChar == null) {
					throw new Error('Unexpected end of input in quoted escape sequence');
				}

				result += unescapeCharacter(nextChar);
				this.index += 2;
				continue;
			}

			if (char === '"') {
				this.index += 1;
				return result;
			}

			result += char;
			this.index += 1;
		}

		throw new Error('Unterminated quoted string in KeyValues input');
	}

	private readBareToken(): string {
		const start = this.index;

		while (this.index < this.text.length) {
			const char = this.text[this.index];
			if (/\s/.test(char) || char === '{' || char === '}') {
				break;
			}
			this.index += 1;
		}

		return this.text.slice(start, this.index);
	}
}

function assignValue(target: KeyValueObject, key: string, value: KeyValue): void {
	const current = target[key];

	if (current === undefined) {
		target[key] = value;
		return;
	}

	target[key] = Array.isArray(current) ? [...current, value] : [current, value];
}

function unescapeCharacter(value: string): string {
	switch (value) {
		case 'n':
			return '\n';
		case 'r':
			return '\r';
		case 't':
			return '\t';
		case '\\':
			return '\\';
		case '"':
			return '"';
		default:
			return value;
	}
}

function mergeObjects(left: KeyValueObject, right: KeyValueObject): KeyValueObject {
	const result: KeyValueObject = { ...left };

	for (const [key, value] of Object.entries(right)) {
		const existing = result[key];
		const mergedExisting = kvMergedObject(existing);
		const mergedIncoming = kvMergedObject(value);

		if (mergedExisting && mergedIncoming) {
			result[key] = mergeObjects(mergedExisting, mergedIncoming);
			continue;
		}

		result[key] = value;
	}

	return result;
}
