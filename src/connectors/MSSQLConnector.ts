import * as sql from 'mssql';
import { IDatabaseConnector, QueryResult } from './IDatabaseConnector';
import { ConnectionConfig, TableDetails, DatabaseObject, Column, Index, Constraint } from '../models/connection';

export class MSSQLConnector implements IDatabaseConnector {
    private pool?: sql.ConnectionPool;
    private config: sql.config;

    constructor(private connectionConfig: ConnectionConfig) {
        this.config = {
            server: connectionConfig.host,
            port: connectionConfig.port,
            user: connectionConfig.username,
            password: connectionConfig.password,
            database: connectionConfig.database,
            options: {
                encrypt: true, // Always use encryption (required for Azure SQL)
                trustServerCertificate: true // Trust self-signed certificates
            }
        };
    }

    async connect(): Promise<void> {
        try {
            this.pool = await new sql.ConnectionPool(this.config).connect();
        } catch (error) {
            throw new Error(`Failed to connect to SQL Server: ${error}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.close();
            this.pool = undefined;
        }
    }

    isConnected(): boolean {
        return this.pool !== undefined && this.pool.connected;
    }

    async testConnection(): Promise<boolean> {
        try {
            console.log('[MSSQL] Testing connection to:', this.connectionConfig.host);
            await this.connect();
            console.log('[MSSQL] Connection successful, disconnecting...');
            await this.disconnect();
            return true;
        } catch (error) {
            console.error('[MSSQL] Connection test failed:', error);
            throw error;
        }
    }

    async executeQuery(query: string): Promise<QueryResult> {
        if (!this.pool) {
            throw new Error('Not connected to database');
        }

        const startTime = Date.now();
        try {
            const result = await this.pool.request().query(query);
            const executionTime = Date.now() - startTime;

            const columns = result.recordset?.columns 
                ? Object.keys(result.recordset.columns) 
                : [];

            return {
                columns,
                rows: result.recordset || [],
                rowCount: result.rowsAffected[0] || 0,
                executionTime
            };
        } catch (error) {
            throw new Error(`Query execution failed: ${error}`);
        }
    }

    private quoteIdentifier(identifier: string): string {
        // SQL Server brackets: escape closing bracket by doubling it
        return `[${identifier.replace(/]/g, ']]')}]`;
    }

    private escapeSqlString(value: string): string {
        return String(value).replace(/'/g, "''");
    }

    private formatQualifiedName(objectName: string, schema?: string): string {
        const schemaName = schema || 'dbo';
        return `${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(objectName)}`;
    }

    private getDatabasePrefix(database?: string): string {
        return database ? `USE ${this.quoteIdentifier(database)};\n` : '';
    }

    getTableDataQuery(tableName: string, schema?: string, limit: number = 1000): string {
        const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 1000;
        const fromTarget = schema
            ? `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(tableName)}`
            : this.quoteIdentifier(tableName);
        return `SELECT TOP (${safeLimit}) * FROM ${fromTarget}`;
    }

    getRenameTableQuery(tableName: string, newName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(tableName, schema);
        const prefix = this.getDatabasePrefix(database);
        return `${prefix}EXEC sp_rename N'${this.escapeSqlString(target)}', N'${this.escapeSqlString(newName)}';`;
    }

    getDropTableQuery(tableName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(tableName, schema);
        const prefix = this.getDatabasePrefix(database);
        return `${prefix}DROP TABLE ${target};`;
    }

    getRenameViewQuery(viewName: string, newName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(viewName, schema);
        const prefix = this.getDatabasePrefix(database);
        return `${prefix}EXEC sp_rename N'${this.escapeSqlString(target)}', N'${this.escapeSqlString(newName)}';`;
    }

    getDropViewQuery(viewName: string, schema?: string, database?: string): string {
        const target = this.formatQualifiedName(viewName, schema);
        const prefix = this.getDatabasePrefix(database);
        return `${prefix}DROP VIEW ${target};`;
    }

    getRenameColumnQuery(tableName: string, columnName: string, newName: string, schema?: string, database?: string): string {
        const tableRef = this.formatQualifiedName(tableName, schema);
        const full = `${tableRef}.${this.quoteIdentifier(columnName)}`;
        const prefix = this.getDatabasePrefix(database);
        return `${prefix}EXEC sp_rename N'${this.escapeSqlString(full)}', N'${this.escapeSqlString(newName)}', 'COLUMN';`;
    }

    getDropColumnQuery(tableName: string, columnName: string, schema?: string, database?: string): string {
        const tableRef = this.formatQualifiedName(tableName, schema);
        const prefix = this.getDatabasePrefix(database);
        return `${prefix}ALTER TABLE ${tableRef} DROP COLUMN ${this.quoteIdentifier(columnName)};`;
    }

    async getDatabases(): Promise<string[]> {
        console.log('[MSSQL] Getting databases, connected:', this.isConnected());
        const result = await this.executeQuery(`
            SELECT name FROM sys.databases 
            WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
            ORDER BY name
        `);
        console.log('[MSSQL] Database query result:', result);
        return result.rows.map(row => row.name);
    }

    async getSchemas(database?: string): Promise<string[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT name
            FROM sys.schemas
            WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA', 'db_owner', 'db_accessadmin', 
                               'db_securityadmin', 'db_ddladmin', 'db_backupoperator', 
                               'db_datareader', 'db_datawriter', 'db_denydatareader', 
                               'db_denydatawriter', 'guest')
            ORDER BY name
        `);
        return result.rows.map(row => row.name);
    }

    async getTables(database?: string, schema?: string): Promise<DatabaseObject[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const schemaFilter = schema ? `WHERE SCHEMA_NAME(schema_id) = '${this.escapeSqlString(schema)}'` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT 
                SCHEMA_NAME(schema_id) as schema_name,
                name
            FROM sys.tables
            ${schemaFilter}
            ORDER BY schema_name, name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'table' as const
        }));
    }

    async getViews(database?: string, schema?: string): Promise<DatabaseObject[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const schemaFilter = schema ? `WHERE SCHEMA_NAME(schema_id) = '${this.escapeSqlString(schema)}'` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT 
                SCHEMA_NAME(schema_id) as schema_name,
                name
            FROM sys.views
            ${schemaFilter}
            ORDER BY schema_name, name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'view' as const
        }));
    }

    async getProcedures(database?: string, schema?: string): Promise<DatabaseObject[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const schemaFilter = schema ? `AND SCHEMA_NAME(schema_id) = '${this.escapeSqlString(schema)}'` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT 
                SCHEMA_NAME(schema_id) as schema_name,
                name
            FROM sys.procedures
            WHERE type = 'P'
            ${schemaFilter}
            ORDER BY schema_name, name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'procedure' as const
        }));
    }

    async getFunctions(database?: string, schema?: string): Promise<DatabaseObject[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const schemaFilter = schema ? `AND SCHEMA_NAME(schema_id) = '${this.escapeSqlString(schema)}'` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT 
                SCHEMA_NAME(schema_id) as schema_name,
                name
            FROM sys.objects
            WHERE type IN ('FN', 'IF', 'TF')
            ${schemaFilter}
            ORDER BY schema_name, name
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'function' as const
        }));
    }

    async getColumns(tableName: string, schema: string = 'dbo', database?: string): Promise<Column[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT 
                c.name,
                t.name as data_type,
                c.is_nullable,
                c.max_length,
                c.precision,
                c.scale,
                c.is_identity,
                CASE WHEN pk.column_id IS NOT NULL THEN 1 ELSE 0 END as is_primary_key,
                CASE WHEN fk.parent_column_id IS NOT NULL THEN 1 ELSE 0 END as is_foreign_key,
                dc.definition as default_value
            FROM sys.columns c
            INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
            LEFT JOIN (
                SELECT ic.object_id, ic.column_id
                FROM sys.index_columns ic
                INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
                WHERE i.is_primary_key = 1
            ) pk ON c.object_id = pk.object_id AND c.column_id = pk.column_id
            LEFT JOIN sys.foreign_key_columns fk ON c.object_id = fk.parent_object_id AND c.column_id = fk.parent_column_id
            LEFT JOIN sys.default_constraints dc ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
            WHERE c.object_id = OBJECT_ID('${schema}.${tableName}')
            ORDER BY c.column_id
        `);

        return result.rows.map(row => ({
            name: row.name,
            dataType: row.data_type,
            nullable: row.is_nullable,
            maxLength: row.max_length,
            precision: row.precision,
            scale: row.scale,
            isPrimaryKey: row.is_primary_key === 1,
            isForeignKey: row.is_foreign_key === 1,
            isIdentity: row.is_identity,
            defaultValue: row.default_value
        }));
    }

    async getIndexes(tableName: string, schema: string = 'dbo', database?: string): Promise<Index[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT 
                i.name,
                i.is_unique,
                i.is_primary_key,
                i.type_desc,
                STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns
            FROM sys.indexes i
            INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
            INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            WHERE i.object_id = OBJECT_ID('${schema}.${tableName}')
            GROUP BY i.name, i.is_unique, i.is_primary_key, i.type_desc
            ORDER BY i.name
        `);

        return result.rows.map(row => ({
            name: row.name,
            columns: row.columns.split(', '),
            isUnique: row.is_unique,
            isPrimaryKey: row.is_primary_key,
            type: row.type_desc
        }));
    }

    async getConstraints(tableName: string, schema: string = 'dbo', database?: string): Promise<Constraint[]> {
        const dbClause = database ? `USE ${this.quoteIdentifier(database)};` : '';
        const result = await this.executeQuery(`
            ${dbClause}
            SELECT 
                kc.name,
                kc.type_desc,
                STRING_AGG(c.name, ', ') WITHIN GROUP (ORDER BY ic.key_ordinal) as columns,
                OBJECT_SCHEMA_NAME(fk.referenced_object_id) as ref_schema,
                OBJECT_NAME(fk.referenced_object_id) as ref_table,
                (
                    SELECT STRING_AGG(rc.name, ', ') WITHIN GROUP (ORDER BY fkc.constraint_column_id)
                    FROM sys.foreign_key_columns fkc
                    INNER JOIN sys.columns rc ON fkc.referenced_object_id = rc.object_id 
                        AND fkc.referenced_column_id = rc.column_id
                    WHERE fkc.constraint_object_id = kc.object_id
                ) as ref_columns
            FROM sys.key_constraints kc
            LEFT JOIN sys.index_columns ic ON kc.parent_object_id = ic.object_id 
                AND kc.unique_index_id = ic.index_id
            LEFT JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
            LEFT JOIN sys.foreign_keys fk ON kc.object_id = fk.object_id
            WHERE kc.parent_object_id = OBJECT_ID('${schema}.${tableName}')
            GROUP BY kc.name, kc.type_desc, kc.object_id, fk.referenced_object_id

            UNION ALL

            SELECT 
                cc.name,
                'CHECK_CONSTRAINT' as type_desc,
                '' as columns,
                NULL as ref_schema,
                NULL as ref_table,
                NULL as ref_columns
            FROM sys.check_constraints cc
            WHERE cc.parent_object_id = OBJECT_ID('${schema}.${tableName}')
        `);

        return result.rows.map(row => ({
            name: row.name,
            type: this.mapConstraintType(row.type_desc),
            columns: row.columns ? row.columns.split(', ') : [],
            referencedTable: row.ref_table ? `${row.ref_schema}.${row.ref_table}` : undefined,
            referencedColumns: row.ref_columns ? row.ref_columns.split(', ') : undefined
        }));
    }

    private mapConstraintType(typeDesc: string): 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | 'DEFAULT' {
        if (typeDesc.includes('PRIMARY')) {
            return 'PRIMARY KEY';
        }
        if (typeDesc.includes('FOREIGN')) {
            return 'FOREIGN KEY';
        }
        if (typeDesc.includes('UNIQUE')) {
            return 'UNIQUE';
        }
        if (typeDesc.includes('CHECK')) {
            return 'CHECK';
        }
        return 'DEFAULT';
    }

    async getTableDetails(tableName: string, schema: string = 'dbo', database?: string): Promise<TableDetails> {
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
