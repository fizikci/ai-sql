import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ConnectionMetadata, DatabaseMetadata, FieldMetadata, MetadataFile, TableMetadata } from '../models/metadata';

const DEFAULT_DB_KEY = '__default__';

function safeString(value: unknown): string {
    return typeof value === 'string' ? value : String(value ?? '');
}

function tableKey(schema: string | undefined, tableName: string): string {
    const s = (schema ?? '').trim();
    return s ? `${s}.${tableName}` : tableName;
}

function dbKey(database?: string): string {
    const db = (database ?? '').trim();
    return db ? db : DEFAULT_DB_KEY;
}

export class MetadataStorage {
    private readonly dirPath: string;
    private readonly filePath: string;

    constructor() {
        this.dirPath = path.join(os.homedir(), '.sql-with-ai');
        this.filePath = path.join(this.dirPath, 'metadata.json');
    }

    getMetadataFilePath(): string {
        return this.filePath;
    }

    private defaultFile(): MetadataFile {
        return { version: 1, connections: {} };
    }

    private normalizeFile(raw: any): MetadataFile {
        if (!raw || typeof raw !== 'object') {
            return this.defaultFile();
        }
        const version = raw.version === 1 ? 1 : 1;
        const connections = (raw.connections && typeof raw.connections === 'object') ? raw.connections : {};
        return { version, connections } as MetadataFile;
    }

    async read(): Promise<MetadataFile> {
        await fs.mkdir(this.dirPath, { recursive: true });

        try {
            const content = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(content);
            return this.normalizeFile(parsed);
        } catch (e: any) {
            // Create the file if missing or invalid.
            const file = this.defaultFile();
            try {
                await fs.writeFile(this.filePath, JSON.stringify(file, null, 2), 'utf8');
            } catch {
                // ignore
            }
            return file;
        }
    }

    async write(file: MetadataFile): Promise<void> {
        await fs.mkdir(this.dirPath, { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(file, null, 2), 'utf8');
    }

    private getDbKey(database?: string): string {
        return dbKey(database);
    }

    async getConnectionMetadata(connectionId: string): Promise<ConnectionMetadata | undefined> {
        const file = await this.read();
        return file.connections?.[connectionId];
    }

    async getDatabaseMetadata(connectionId: string, database?: string): Promise<DatabaseMetadata | undefined> {
        const conn = await this.getConnectionMetadata(connectionId);
        const key = this.getDbKey(database);
        return conn?.databases?.[key];
    }

    async getTableMetadata(
        connectionId: string,
        database: string | undefined,
        schema: string | undefined,
        tableName: string
    ): Promise<TableMetadata | undefined> {
        const dbMeta = await this.getDatabaseMetadata(connectionId, database);
        const key = tableKey(schema, tableName);
        return dbMeta?.tables?.[key];
    }

    async getFieldMetadata(
        connectionId: string,
        database: string | undefined,
        schema: string | undefined,
        tableName: string,
        fieldName: string
    ): Promise<FieldMetadata | undefined> {
        const table = await this.getTableMetadata(connectionId, database, schema, tableName);
        return table?.fields?.[fieldName];
    }

    async getTableGroup(
        connectionId: string,
        database: string | undefined,
        schema: string | undefined,
        tableName: string
    ): Promise<string> {
        const meta = await this.getTableMetadata(connectionId, database, schema, tableName);
        const group = safeString(meta?.group).trim();
        return group || 'Others';
    }

    async setTableGroup(
        connectionId: string,
        database: string | undefined,
        schema: string | undefined,
        tableName: string,
        groupName: string | undefined
    ): Promise<void> {
        const desired = safeString(groupName).trim();
        const normalized = desired || 'Others';

        const file = await this.read();
        if (!file.connections) {
            file.connections = {} as any;
        }
        if (!file.connections[connectionId]) {
            file.connections[connectionId] = { databases: {} };
        }

        const conn = file.connections[connectionId];
        if (!conn.databases) {
            conn.databases = {};
        }

        const dKey = this.getDbKey(database);
        if (!conn.databases[dKey]) {
            conn.databases[dKey] = { tables: {} };
        }

        const dbMeta = conn.databases[dKey];
        if (!dbMeta.tables) {
            dbMeta.tables = {};
        }

        const tKey = tableKey(schema, tableName);
        if (!dbMeta.tables[tKey]) {
            dbMeta.tables[tKey] = {};
        }

        // Store only when not default, so metadata stays clean.
        if (normalized === 'Others') {
            delete dbMeta.tables[tKey].group;
        } else {
            dbMeta.tables[tKey].group = normalized;
        }

        await this.write(file);
    }
}

export const MetadataKeys = {
    tableKey,
    dbKey,
};
