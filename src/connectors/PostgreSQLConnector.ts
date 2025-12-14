import { Client } from 'pg';
import { IDatabaseConnector, QueryResult } from './IDatabaseConnector';
import { ConnectionConfig, TableDetails, DatabaseObject, Column, Index, Constraint } from '../models/connection';

export class PostgreSQLConnector implements IDatabaseConnector {
    private client?: Client;

    constructor(private connectionConfig: ConnectionConfig) {}

    async connect(): Promise<void> {
        try {
            this.client = new Client({
                host: this.connectionConfig.host,
                port: this.connectionConfig.port,
                user: this.connectionConfig.username,
                password: this.connectionConfig.password,
                database: this.connectionConfig.database || 'postgres',
                ssl: this.connectionConfig.ssl ? { rejectUnauthorized: false } : false
            });
            await this.client.connect();
        } catch (error) {
            throw new Error(`Failed to connect to PostgreSQL: ${error}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.end();
            this.client = undefined;
        }
    }

    isConnected(): boolean {
        return this.client !== undefined;
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
        if (!this.client) {
            throw new Error('Not connected to database');
        }

        const startTime = Date.now();
        try {
            const result = await this.client.query(query);
            const executionTime = Date.now() - startTime;

            const columns = result.fields.map(field => field.name);

            return {
                columns,
                rows: result.rows,
                rowCount: result.rowCount || 0,
                executionTime
            };
        } catch (error) {
            throw new Error(`Query execution failed: ${error}`);
        }
    }

    async getDatabases(): Promise<string[]> {
        const result = await this.executeQuery(`
            SELECT datname FROM pg_database 
            WHERE datistemplate = false 
            AND datname NOT IN ('postgres')
            ORDER BY datname
        `);
        return result.rows.map(row => row.datname);
    }

    async getTables(database?: string): Promise<DatabaseObject[]> {
        const result = await this.executeQuery(`
            SELECT 
                schemaname as schema_name,
                tablename as name
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY schemaname, tablename
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'table' as const
        }));
    }

    async getViews(database?: string): Promise<DatabaseObject[]> {
        const result = await this.executeQuery(`
            SELECT 
                schemaname as schema_name,
                viewname as name
            FROM pg_views
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY schemaname, viewname
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'view' as const
        }));
    }

    async getProcedures(database?: string): Promise<DatabaseObject[]> {
        const result = await this.executeQuery(`
            SELECT 
                n.nspname as schema_name,
                p.proname as name
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND p.prokind = 'p'
            ORDER BY n.nspname, p.proname
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'procedure' as const
        }));
    }

    async getFunctions(database?: string): Promise<DatabaseObject[]> {
        const result = await this.executeQuery(`
            SELECT 
                n.nspname as schema_name,
                p.proname as name
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
            AND p.prokind = 'f'
            ORDER BY n.nspname, p.proname
        `);
        
        return result.rows.map(row => ({
            name: row.name,
            schema: row.schema_name,
            type: 'function' as const
        }));
    }

    async getColumns(tableName: string, schema: string = 'public'): Promise<Column[]> {
        const result = await this.executeQuery(`
            SELECT 
                c.column_name,
                c.data_type,
                c.is_nullable = 'YES' as is_nullable,
                c.column_default,
                c.character_maximum_length,
                c.numeric_precision,
                c.numeric_scale,
                CASE WHEN pk.column_name IS NOT NULL THEN true ELSE false END as is_primary_key,
                CASE WHEN fk.column_name IS NOT NULL THEN true ELSE false END as is_foreign_key
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT ku.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku 
                    ON tc.constraint_name = ku.constraint_name
                    AND tc.table_schema = ku.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                AND tc.table_name = '${tableName}'
                AND tc.table_schema = '${schema}'
            ) pk ON c.column_name = pk.column_name
            LEFT JOIN (
                SELECT ku.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage ku 
                    ON tc.constraint_name = ku.constraint_name
                    AND tc.table_schema = ku.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_name = '${tableName}'
                AND tc.table_schema = '${schema}'
            ) fk ON c.column_name = fk.column_name
            WHERE c.table_name = '${tableName}'
            AND c.table_schema = '${schema}'
            ORDER BY c.ordinal_position
        `);

        return result.rows.map(row => ({
            name: row.column_name,
            dataType: row.data_type,
            nullable: row.is_nullable,
            maxLength: row.character_maximum_length,
            precision: row.numeric_precision,
            scale: row.numeric_scale,
            isPrimaryKey: row.is_primary_key,
            isForeignKey: row.is_foreign_key,
            defaultValue: row.column_default
        }));
    }

    async getIndexes(tableName: string, schema: string = 'public'): Promise<Index[]> {
        const result = await this.executeQuery(`
            SELECT 
                i.relname as name,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary_key,
                am.amname as type,
                array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) as columns
            FROM pg_index ix
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            JOIN pg_am am ON am.oid = i.relam
            WHERE t.relname = '${tableName}'
            AND n.nspname = '${schema}'
            GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
            ORDER BY i.relname
        `);

        return result.rows.map(row => ({
            name: row.name,
            columns: row.columns,
            isUnique: row.is_unique,
            isPrimaryKey: row.is_primary_key,
            type: row.type
        }));
    }

    async getConstraints(tableName: string, schema: string = 'public'): Promise<Constraint[]> {
        const result = await this.executeQuery(`
            SELECT 
                tc.constraint_name as name,
                tc.constraint_type as type,
                array_agg(DISTINCT kcu.column_name) as columns,
                ccu.table_name as referenced_table,
                array_agg(DISTINCT ccu.column_name) as referenced_columns
            FROM information_schema.table_constraints tc
            LEFT JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
            LEFT JOIN information_schema.constraint_column_usage ccu 
                ON tc.constraint_name = ccu.constraint_name
                AND tc.table_schema = ccu.table_schema
            WHERE tc.table_name = '${tableName}'
            AND tc.table_schema = '${schema}'
            GROUP BY tc.constraint_name, tc.constraint_type, ccu.table_name
            ORDER BY tc.constraint_name
        `);

        return result.rows.map(row => ({
            name: row.name,
            type: row.type as any,
            columns: row.columns || [],
            referencedTable: row.referenced_table,
            referencedColumns: row.referenced_columns
        }));
    }

    async getTableDetails(tableName: string, schema: string = 'public'): Promise<TableDetails> {
        const [columns, indexes, constraints] = await Promise.all([
            this.getColumns(tableName, schema),
            this.getIndexes(tableName, schema),
            this.getConstraints(tableName, schema)
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
