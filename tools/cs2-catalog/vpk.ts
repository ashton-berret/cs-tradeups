import { readFile } from 'node:fs/promises';
import path from 'node:path';

const VPK_SIGNATURE = 0x55aa1234;
const DIRECTORY_ARCHIVE_INDEX = 0x7fff;

export interface VpkHeader {
	signature: number;
	version: number;
	treeSize: number;
	headerSize: number;
	fileDataSectionSize: number;
	archiveMd5SectionSize: number;
	otherMd5SectionSize: number;
	signatureSectionSize: number;
}

export interface VpkEntry {
	fullPath: string;
	extension: string;
	directory: string;
	fileName: string;
	crc32: number;
	preloadBytes: number;
	archiveIndex: number;
	entryOffset: number;
	entryLength: number;
	preloadData: Buffer;
}

export interface VpkDirectory {
	header: VpkHeader;
	dataOffset: number;
	entries: Map<string, VpkEntry>;
}

export async function loadVpkDirectory(directoryFilePath: string): Promise<{
	buffer: Buffer;
	directory: VpkDirectory;
}> {
	const buffer = await readFile(directoryFilePath);
	const directory = parseVpkDirectory(buffer);

	return { buffer, directory };
}

export function parseVpkDirectory(buffer: Buffer): VpkDirectory {
	const signature = buffer.readUInt32LE(0);
	if (signature !== VPK_SIGNATURE) {
		throw new Error(`Invalid VPK signature: expected 0x${VPK_SIGNATURE.toString(16)}, got 0x${signature.toString(16)}`);
	}

	const version = buffer.readUInt32LE(4);
	const treeSize = buffer.readUInt32LE(8);
	const headerSize = version === 2 ? 28 : 12;

	const header: VpkHeader = {
		signature,
		version,
		treeSize,
		headerSize,
		fileDataSectionSize: version === 2 ? buffer.readUInt32LE(12) : 0,
		archiveMd5SectionSize: version === 2 ? buffer.readUInt32LE(16) : 0,
		otherMd5SectionSize: version === 2 ? buffer.readUInt32LE(20) : 0,
		signatureSectionSize: version === 2 ? buffer.readUInt32LE(24) : 0,
	};

	let offset = headerSize;
	const entries = new Map<string, VpkEntry>();

	while (true) {
		const extension = readCString(buffer, offset);
		offset = extension.nextOffset;
		if (!extension.value) break;

		while (true) {
			const directory = readCString(buffer, offset);
			offset = directory.nextOffset;
			if (!directory.value) break;

			while (true) {
				const fileName = readCString(buffer, offset);
				offset = fileName.nextOffset;
				if (!fileName.value) break;

				const crc32 = buffer.readUInt32LE(offset);
				const preloadBytes = buffer.readUInt16LE(offset + 4);
				const archiveIndex = buffer.readUInt16LE(offset + 6);
				const entryOffset = buffer.readUInt32LE(offset + 8);
				const entryLength = buffer.readUInt32LE(offset + 12);
				const terminator = buffer.readUInt16LE(offset + 16);
				offset += 18;

				if (terminator !== 0xffff) {
					throw new Error(`Invalid VPK directory terminator for ${fileName.value}.${extension.value}`);
				}

				const preloadData = buffer.subarray(offset, offset + preloadBytes);
				offset += preloadBytes;

				const normalizedDirectory = directory.value === ' ' ? '' : directory.value;
				const normalizedExtension = extension.value === ' ' ? '' : extension.value;
				const fullPath = normalizedDirectory
					? `${normalizedDirectory}/${fileName.value}${normalizedExtension ? `.${normalizedExtension}` : ''}`
					: `${fileName.value}${normalizedExtension ? `.${normalizedExtension}` : ''}`;

				entries.set(fullPath.toLowerCase(), {
					fullPath,
					extension: normalizedExtension,
					directory: normalizedDirectory,
					fileName: fileName.value,
					crc32,
					preloadBytes,
					archiveIndex,
					entryOffset,
					entryLength,
					preloadData,
				});
			}
		}
	}

	return {
		header,
		dataOffset: headerSize + treeSize,
		entries,
	};
}

export async function readVpkEntry(
	directoryFilePath: string,
	directoryBuffer: Buffer,
	directory: VpkDirectory,
	entry: VpkEntry,
): Promise<Buffer> {
	const body =
		entry.entryLength === 0
			? Buffer.alloc(0)
			: entry.archiveIndex === DIRECTORY_ARCHIVE_INDEX
				? directoryBuffer.subarray(
						directory.dataOffset + entry.entryOffset,
						directory.dataOffset + entry.entryOffset + entry.entryLength,
					)
				: (await readFile(resolveArchiveFilePath(directoryFilePath, entry.archiveIndex))).subarray(
						entry.entryOffset,
						entry.entryOffset + entry.entryLength,
					);

	return entry.preloadBytes > 0 ? Buffer.concat([entry.preloadData, body]) : Buffer.from(body);
}

export function resolveArchiveFilePath(directoryFilePath: string, archiveIndex: number): string {
	const parsed = path.parse(directoryFilePath);
	const archiveName = parsed.name.replace(/_dir$/i, `_${archiveIndex.toString().padStart(3, '0')}`);
	return path.join(parsed.dir, `${archiveName}${parsed.ext}`);
}

function readCString(buffer: Buffer, offset: number): { value: string; nextOffset: number } {
	let cursor = offset;
	while (cursor < buffer.length && buffer[cursor] !== 0) {
		cursor += 1;
	}

	if (cursor >= buffer.length) {
		throw new Error('Unexpected end of VPK directory while reading string');
	}

	return {
		value: buffer.toString('utf8', offset, cursor),
		nextOffset: cursor + 1,
	};
}
