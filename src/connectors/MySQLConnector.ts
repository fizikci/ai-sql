import * as mysql from 'mysql2/promise';
import { IDatabaseConnector, QueryResult } from './IDatabaseConnector';
import { ConnectionConfig, TableDetails, DatabaseObject, Column, Index, Constraint } from '../models/connection';

export class MySQLConnector implements IDatabaseConnector {
    private connection?: mysql.Connection;

    constructor(private connectionConfig: ConnectionConfig) {}

    async connect(): Promise<void> {
        try {
            this.connection = await mysql.createConnection({
                host: this.connectionConfig.host,
                port: this.connectionConfig.port,
                user: this.connectionConfig.username,
                password: this.connectionConfig.password,
                database: this.connectionConfig.database,
                ssl: this.connectionConfig.ssl ? {} : undefined
            });
        } catch (error) {
            throw new Error(`Failed to connect to MySQL: ${error}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.connection) {
            await this.connection.end();
            this.connection = undefined;
        }
    }

    isConnected(): boolean {
        return this.connection !== undefined;
    }

    async testConnection(): Promise<boolean> {
        try {
            await this.connect();
            await this.disconnect();
            return true;
        } catch (error) {
            return false;
        }
    }

    async executeQuery(query: string): Promise<QueryResult> {
        if (!this.connection) {
            throw new Error('Not connected to database');
        }

        const startTime = Date.now();
        try {
            const [rows, fields] = await this.connection.query(query);
            const executionTime = Date.now() - startTime;

            const columns = fields ? fields.map(field => field.name) : [];
            const rowArray = Array.isArray(rows) ? rows : [];

            return {
                columns,
                rows: rowArray,
                rowCount: rowArray.length,
                executionTime
            };
        } catch (error) {
            throw new Error(`Query execution failed: ${error}`);
        }
    }

    private quoteIdentifier(identifier: string): string {
        // MySQL backticks: escape by doubling
        return `\`${identifier.replace(/`/g, '``')}\``;
    }

    private formatQualifiedName(objectName: string, schema?: string, database?: string): string {
        const dbName = schema || database;
        return dbName
            ? `${this.quoteIdentifier(dbName)}.${this.quoteIdentifier(objectName)}`
            : this.quoteIdentifier(objectName);
    }

    getTableDataQuery(tableName: string, schema?: string, limit: number = 1000): string {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1000;
        const fromTarget = schema
            ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(tableName)}`
            : this.quoteIdentifier(tableName);
        return `SELECT * FROM ${fromTarget} LIMIT ${safeLimit}`;
    }

    getRenameTableQuery(tableName: string, newName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(tableName, schema, database);
        const next = this.formatQualifiedName(newName, schema, database);
        return `RENAME TABLE ${target} TO ${next};`;
    }

    getDropTableQuery(tableName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(tableName, schema, database);
        return `DROP TABLE ${target};`;
    }

    getRenameViewQuery(viewName: string, newName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(viewName, schema, database);
        const next = this.formatQualifiedName(newName, schema, database);
        return `RENAME TABLE ${target} TO ${next};`;
    }

    getDropViewQuery(viewName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(viewName, schema, database);
        return `DROP VIEW ${target};`;
    }

    getRenameColumnQuery(tableName: string, columnName: string, newName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(tableName, schema, database);
        return `ALTER TABLE ${target} RENAME COLUMN ${this.quoteIdentifier(columnName)} TO ${this.quoteIdentifier(newName)};`;
    }

    getDropColumnQuery(tableName: string, columnName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(tableName, schema, database);
        return `ALTER TABLE ${target} DROP COLUMN ${this.quoteIdentifier(columnName)};`;
    }

    async getDatabases(): Promise<string[]> {
        const result = await this.executeQuery(`
            SELECT schema_name as name
            FROM information_schema.schemata 
            WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY schema_name
        `);
        return result.rows.map(row => row.name);
    }

    // In MySQL, schemas and databases are synonymous, so this returns databases
    async getSchemas(database?: string): Promise<string[]> {
        // If a database is specified, return just that one (as the "schema")
        // Otherwise return all databases
        if (database) {
            return [database];
        }
        return this.getDatabases();
    }

    async getTables(database?: string, schema?: string): Promise<DatabaseObject[]> {
        // In MySQL, schema is the same as database
        const targetDb = schema || database;
        const dbClause = targetDb ? `AND table_schema = '${targetDb.replace(/'/g, "''")}'` : '';
        const result = await this.executeQuery(`
            SELECT 
                table_schema as schema_name,
                table_name as name
            FROM information_schema.tables
            WHERE table_type = 'BASE TABLE'
            ${dbClause}
            AND table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY table_schema, table_name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'table' as const
        }));
    }

    async getViews(database?: string, schema?: string): Promise<DatabaseObject[]> {
        const targetDb = schema || database;
        const dbClause = targetDb ? `AND table_schema = '${targetDb.replace(/'/g, "''")}'` : '';
        const result = await this.executeQuery(`
            SELECT 
                table_schema as schema_name,
                table_name as name
            FROM information_schema.views
            WHERE 1=1
            ${dbClause}
            AND table_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY table_schema, table_name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'view' as const
        }));
    }

    async getProcedures(database?: string, schema?: string): Promise<DatabaseObject[]> {
        const targetDb = schema || database;
        const dbClause = targetDb ? `AND routine_schema = '${targetDb.replace(/'/g, "''")}'` : '';
        const result = await this.executeQuery(`
            SELECT 
                routine_schema as schema_name,
                routine_name as name
            FROM information_schema.routines
            WHERE routine_type = 'PROCEDURE'
            ${dbClause}
            AND routine_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY routine_schema, routine_name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'procedure' as const
        }));
    }

    async getFunctions(database?: string, schema?: string): Promise<DatabaseObject[]> {
        const targetDb = schema || database;
        const dbClause = targetDb ? `AND routine_schema = '${targetDb.replace(/'/g, "''")}'` : '';
        const result = await this.executeQuery(`
            SELECT 
                routine_schema as schema_name,
                routine_name as name
            FROM information_schema.routines
            WHERE routine_type = 'FUNCTION'
            ${dbClause}
            AND routine_schema NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
            ORDER BY routine_schema, routine_name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'function' as const
        }));
    }

    async getColumns(tableName: string, schema?: string, database?: string): Promise<Column[]> {
        const dbName = database || schema || this.connectionConfig.database || '';
        const result = await this.executeQuery(`
            SELECT 
                column_name,
                data_type,
                is_nullable = 'YES' as is_nullable,
                column_default,
                character_maximum_length,
                numeric_precision,
                numeric_scale,
                column_key = 'PRI' as is_primary_key,
                column_key = 'MUL' as is_foreign_key,
                extra LIKE '%auto_increment%' as is_identity
            FROM information_schema.columns
            WHERE table_name = '${tableName}'
            AND table_schema = '${dbName}'
            ORDER BY ordinal_position
        `);

        return result.rows.map(row => ({
            name: row.column_name,
            dataType: row.data_type,
            nullable: row.is_nullable === 1,
            maxLength: row.character_maximum_length,
            precision: row.numeric_precision,
            scale: row.numeric_scale,
            isPrimaryKey: row.is_primary_key === 1,
            isForeignKey: row.is_foreign_key === 1,
            isIdentity: row.is_identity === 1,
            defaultValue: row.column_default
        }));
    }

    async getIndexes(tableName: string, schema?: string, database?: string): Promise<Index[]> {
        const dbName = database || schema || this.connectionConfig.database || '';
        const result = await this.executeQuery(`
            SELECT 
                index_name as name,
                non_unique = 0 as is_unique,
                index_name = 'PRIMARY' as is_primary_key,
                index_type as type,
                GROUP_CONCAT(column_name ORDER BY seq_in_index) as columns
            FROM information_schema.statistics
            WHERE table_name = '${tableName}'
            AND table_schema = '${dbName}'
            GROUP BY index_name, non_unique, index_type
            ORDER BY index_name
        `);

        return result.rows.map(row => ({
            name: row.name,
            columns: row.columns.split(','),
            isUnique: row.is_unique === 1,
            isPrimaryKey: row.is_primary_key === 1,
            type: row.type
        }));
    }

    async getConstraints(tableName: string, schema?: string, database?: string): Promise<Constraint[]> {
        const dbName = database || schema || this.connectionConfig.database || '';
        const result = await this.executeQuery(`
            SELECT 
                tc.constraint_name as name,
                tc.constraint_type as type,
                GROUP_CONCAT(DISTINCT kcu.column_name) as columns,
                kcu.referenced_table_name as referenced_table,
                GROUP_CONCAT(DISTINCT kcu.referenced_column_name) as referenced_columns
            FROM information_schema.table_constraints tc
            LEFT JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
                AND tc.table_name = kcu.table_name
            WHERE tc.table_name = '${tableName}'
            AND tc.table_schema = '${dbName}'
            GROUP BY tc.constraint_name, tc.constraint_type, kcu.referenced_table_name
            ORDER BY tc.constraint_name
        `);

        return result.rows.map(row => ({
            name: row.name,
            type: row.type as any,
            columns: row.columns ? row.columns.split(',') : [],
            referencedTable: row.referenced_table,
            referencedColumns: row.referenced_columns ? row.referenced_columns.split(',') : undefined
        }));
    }

    async getTableDetails(tableName: string, schema?: string, database?: string): Promise<TableDetails> {
        const [columns, indexes, constraints] = await Promise.all([
            this.getColumns(tableName, schema, database),
            this.getIndexes(tableName, schema, database),
            this.getConstraints(tableName, schema, database)
        ]);

        return {
            name: tableName,
            schema,
            columns,
            indexes,
            constraints
        };
    }
}
